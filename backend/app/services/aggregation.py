"""
Cross-run aggregation + de-duplication of layer concepts.

Each layer is analyzed `RUNS_PER_LAYER` times (forced repetition). Rather than
keeping a single run (wasteful best-of-N), this module merges the concepts from
ALL valid runs into one layer:

  * Duplicate / synonymous winning concepts are merged into one. Similarity is
    SEMANTIC when an embedder is provided (catches "precio" vs "costo"), and
    falls back to a language-agnostic character-bigram heuristic otherwise.
  * Their supporting quotes are unioned and de-duplicated (the same verbatim
    comment must not appear twice).
  * Merge frequency — in how many runs a concept appeared — is the primary
    ranking signal: a concept found in 4/5 runs is more robust than a one-off.
    Ties break by the model's k_top_score. The top `k` survive.

`aggregate_layer` is async only because the embedder does network I/O; with
`embedder=None` it is effectively synchronous and uses the lexical heuristic.
"""

from __future__ import annotations

import math
import re
from typing import Awaitable, Callable

from app.models import AnalysisLayer, Concept, DiscardedConcept

# Lexical fallback: bigram-set Jaccard at/above this merges two labels.
SIMILARITY_THRESHOLD = 0.6
# Semantic: cosine of embedding vectors at/above this merges two concepts.
SEMANTIC_THRESHOLD = 0.82

# embedder(texts) -> one vector per text, or None to signal "fall back to lexical".
Embedder = Callable[[list[str]], Awaitable["list[list[float]] | None"]]

_WORD = re.compile(r"\w+", re.UNICODE)


def _normalize(text: str) -> str:
    """Lowercase and strip punctuation/spacing for stable comparison."""
    return "".join(_WORD.findall(text.lower()))


def _bigrams(text: str) -> set[str]:
    s = _normalize(text)
    if len(s) < 2:
        return {s} if s else set()
    return {s[i : i + 2] for i in range(len(s) - 1)}


def _lexically_similar(label_a: str, label_b: str) -> bool:
    na, nb = _normalize(label_a), _normalize(label_b)
    if na and na == nb:
        return True
    ba, bb = _bigrams(label_a), _bigrams(label_b)
    if not ba or not bb:
        return False
    return len(ba & bb) / len(ba | bb) >= SIMILARITY_THRESHOLD


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0.0 or nb == 0.0:
        return 0.0
    return dot / (na * nb)


def _dedup_quotes(quotes: list[str]) -> list[str]:
    """Drop repeated quotes (case/space-insensitive), preserving first order."""
    seen: set[str] = set()
    out: list[str] = []
    for q in quotes:
        key = _normalize(q)
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(q)
    return out


def _embed_text(concept: Concept) -> str:
    """Text fed to the embedder: concept name plus its grouping rationale."""
    just = (concept.grouping_justification or "")[:300]
    return f"{concept.label}. {just}".strip()


def _cluster_lexical(items: list[tuple[int, Concept]]) -> list[list[int]]:
    groups: list[list[int]] = []
    rep_labels: list[str] = []
    for idx, (_run, concept) in enumerate(items):
        match = next(
            (gi for gi, rl in enumerate(rep_labels) if _lexically_similar(concept.label, rl)),
            None,
        )
        if match is None:
            groups.append([idx])
            rep_labels.append(concept.label)
        else:
            groups[match].append(idx)
    return groups


def _cluster_semantic(
    items: list[tuple[int, Concept]],
    vectors: list[list[float]],
) -> list[list[int]]:
    """Greedy single-link clustering by cosine against each group's seed vector."""
    groups: list[list[int]] = []
    seeds: list[list[float]] = []
    for idx, vec in enumerate(vectors):
        best_gi: int | None = None
        best_sim = SEMANTIC_THRESHOLD
        for gi, seed in enumerate(seeds):
            sim = _cosine(vec, seed)
            if sim >= best_sim:
                best_sim = sim
                best_gi = gi
        if best_gi is None:
            groups.append([idx])
            seeds.append(vec)
        else:
            groups[best_gi].append(idx)
    return groups


def _build_winners(
    items: list[tuple[int, Concept]],
    groups: list[list[int]],
    k: int,
    level: int,
) -> list[Concept]:
    built: list[tuple[int, Concept, list[str], list[str]]] = []
    for group in groups:
        members = [items[i][1] for i in group]
        runs = {items[i][0] for i in group}
        rep = max(members, key=lambda c: c.k_top_score)
        quotes = _dedup_quotes([q for m in members for q in m.supporting_quotes])
        others = sorted({m.label for m in members if m.label != rep.label})
        built.append((len(runs), rep, quotes, others))

    # Most robust first: appeared in more runs, then higher model score.
    built.sort(key=lambda t: (t[0], t[1].k_top_score), reverse=True)

    winners: list[Concept] = []
    for rank, (_freq, rep, quotes, others) in enumerate(built[:k], start=1):
        winners.append(
            Concept(
                id=f"l{level}-w{rank}",
                label=rep.label,
                description="",
                supporting_quotes=quotes,
                score=rep.k_top_score,
                rank=rank,
                k_top_score=rep.k_top_score,
                grouping_justification=rep.grouping_justification,
                merged_from=others,
            )
        )
    return winners


def _dedup_discards(candidates: list[AnalysisLayer], level: int) -> list[DiscardedConcept]:
    seen: set[str] = set()
    discards: list[DiscardedConcept] = []
    for cand in candidates:
        for d in cand.discarded_concepts:
            key = _normalize(d.label)
            if not key or key in seen:
                continue
            seen.add(key)
            discards.append(
                DiscardedConcept(
                    id=f"l{level}-d{len(discards) + 1}",
                    label=d.label,
                    description="",
                    supporting_quotes=_dedup_quotes(d.supporting_quotes),
                    score=0.0,
                    discard_reason=d.discard_reason,
                    discard_justification=d.discard_justification,
                )
            )
    return discards


async def aggregate_layer(
    candidates: list[AnalysisLayer],
    k: int,
    layer_id: str,
    embedder: Embedder | None = None,
) -> AnalysisLayer:
    """
    Merge the per-run layers in `candidates` into one de-duplicated layer.

    Clusters winning concepts semantically (via `embedder`) when available, else
    lexically; ranks clusters by (merge frequency, k_top_score) and caps at `k`.
    Discarded concepts are unioned and de-duplicated by label.
    """
    level = candidates[0].level
    items: list[tuple[int, Concept]] = [
        (run_idx, concept)
        for run_idx, cand in enumerate(candidates)
        for concept in cand.winning_concepts
    ]

    groups: list[list[int]] | None = None
    if embedder is not None and items:
        vectors = await embedder([_embed_text(c) for _, c in items])
        if vectors and len(vectors) == len(items):
            groups = _cluster_semantic(items, vectors)
    if groups is None:
        groups = _cluster_lexical(items)

    return AnalysisLayer(
        layer_id=layer_id,
        level=level,
        title=f"Layer {level}",
        k=k,
        winning_concepts=_build_winners(items, groups, k, level),
        discarded_concepts=_dedup_discards(candidates, level),
        grouping_justification="",
        sub_layers=[],
    )
