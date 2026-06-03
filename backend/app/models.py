"""
Shared data contracts for the thematic analysis microservice.

These Pydantic (v2) models define the JSON contract that travels between the
FastAPI backend and the Tauri/React frontend. The structure is hierarchical
and recursive so it can represent an arbitrary number of analysis *layers*,
where each layer is produced by one iteration ("run") over the transcript.

The TypeScript interfaces in `frontend/src/types.ts` mirror these models
field-for-field. Field names are snake_case on both sides so the serialized
JSON is identical and no alias mapping is required.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, model_validator

# Supported analysis languages. The document, the UI and the generated analysis
# all share one language (no cross translation).
Language = Literal["es", "en", "zh"]


# --------------------------------------------------------------------------- #
# Enums
# --------------------------------------------------------------------------- #
class AnalysisStatus(str, Enum):
    """Lifecycle status of an analysis job."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


# --------------------------------------------------------------------------- #
# Concept-level models
# --------------------------------------------------------------------------- #
class ConceptBase(BaseModel):
    """Fields common to both winning and discarded concepts."""

    id: str = Field(..., description="Stable identifier for this concept.")
    label: str = Field(..., description="Short human-readable name of the concept.")
    description: str = Field(
        default="",
        description="Longer explanation of what the concept captures.",
    )
    supporting_quotes: List[str] = Field(
        default_factory=list,
        description="Verbatim excerpts from the transcript that support the concept.",
    )
    score: float = Field(
        default=0.0,
        description="Raw relevance/frequency score assigned by the model.",
    )


class Concept(ConceptBase):
    """A 'winning' concept: it survived the k-top selection for its layer."""

    rank: int = Field(
        ...,
        ge=1,
        description="1-based position in the k-top ranking for this layer.",
    )
    k_top_score: float = Field(
        ...,
        description="Score from the k-top metric used to select winners.",
    )
    grouping_justification: str = Field(
        ...,
        description=(
            "AI rationale explaining why the underlying observations were "
            "grouped together into this concept."
        ),
    )
    merged_from: List[str] = Field(
        default_factory=list,
        description="IDs of finer-grained concepts merged into this one.",
    )


class DiscardedConcept(ConceptBase):
    """A concept that was explicitly dropped during this layer's selection."""

    discard_reason: str = Field(
        ...,
        description="Category/short reason the concept was discarded.",
    )
    discard_justification: str = Field(
        ...,
        description=(
            "AI rationale explaining why discarding this concept was the "
            "correct decision (e.g. redundancy, low support, off-topic)."
        ),
    )


# --------------------------------------------------------------------------- #
# Layer model (recursive)
# --------------------------------------------------------------------------- #
class AnalysisLayer(BaseModel):
    """
    One iteration of thematic analysis.

    A layer holds the concepts that won the k-top selection, the concepts that
    were explicitly discarded, and (recursively) the sub-layers produced by
    analyzing the winners at greater depth.
    """

    layer_id: str = Field(..., description="Stable identifier for this layer.")
    level: int = Field(
        ...,
        ge=0,
        description="Depth of this layer in the tree (0 = root layer).",
    )
    title: str = Field(
        default="",
        description="Optional human-readable title summarizing the layer.",
    )
    k: int = Field(
        ...,
        ge=0,
        description="The 'k' used by the k-top metric to pick winners here.",
    )
    winning_concepts: List[Concept] = Field(
        default_factory=list,
        description="Concepts selected by the k-top metric for this layer.",
    )
    discarded_concepts: List[DiscardedConcept] = Field(
        default_factory=list,
        description="Concepts explicitly rejected during this layer.",
    )
    grouping_justification: str = Field(
        default="",
        description=(
            "AI rationale for the overall grouping strategy applied in this "
            "layer (how concepts were clustered before k-top selection)."
        ),
    )
    sub_layers: List["AnalysisLayer"] = Field(
        default_factory=list,
        description="Child layers produced by analyzing the winners deeper.",
    )


# --------------------------------------------------------------------------- #
# Request / Response envelopes
# --------------------------------------------------------------------------- #
class AnalysisOptions(BaseModel):
    """Tunable parameters for an analysis run."""

    max_layers: int = Field(
        default=5,
        ge=2,
        le=10,
        description=(
            "Recursion depth of the analysis tree. Minimum 2 (a single layer is not "
            "a tree). Defaults to 5; the deepest layer converges into the single "
            "general/overarching concept. The user picks this per run from the UI."
        ),
    )
    k_top: int = Field(
        default=5,
        ge=1,
        description="Number of winning concepts to keep per layer.",
    )
    model: str = Field(
        default="gemini-3.1-flash-lite",
        description="Identifier of the Gemini model to invoke.",
    )
    structural_pass: bool = Field(
        default=False,
        description=(
            "When true, run a cheap structural pre-pass (Pass 0) before the "
            "thematic layers: it extracts the interview's sections/phases and "
            "injects them as context into the base layer to improve concept "
            "extraction. Costs one extra AI call."
        ),
    )
    k_per_layer: Optional[List[int]] = Field(
        default=None,
        description=(
            "Explicit per-layer winner counts for the pyramidal synthesis "
            "(manual mode). When provided it overrides the auto sequence derived "
            "from k_top and MUST have length == max_layers, be strictly "
            "decreasing, and end in 1 (the apex converges to a single concept). "
            "Index 0 is the widest base layer."
        ),
    )

    @model_validator(mode="after")
    def _validate_pyramid(self) -> "AnalysisOptions":
        """Enforce the pyramidal invariant when an explicit width list is given."""
        widths = self.k_per_layer
        if widths is None:
            return self
        if len(widths) != self.max_layers:
            raise ValueError(
                f"k_per_layer must have exactly max_layers ({self.max_layers}) "
                f"entries, got {len(widths)}."
            )
        if any(w < 1 for w in widths):
            raise ValueError("k_per_layer values must all be >= 1.")
        if widths[-1] != 1:
            raise ValueError(
                "k_per_layer must end in 1 (the apex layer converges to a single "
                "central concept)."
            )
        if any(widths[i] <= widths[i + 1] for i in range(len(widths) - 1)):
            raise ValueError(
                "k_per_layer must be strictly decreasing (each upper layer keeps "
                "fewer concepts than the layer below it)."
            )
        return self


class AnalysisRequest(BaseModel):
    """Payload sent by the frontend: clean text extracted from the .docx."""

    transcript_text: str = Field(
        ...,
        description="Cleaned plain text extracted from the interview .docx.",
    )
    language: Language = Field(
        ...,
        description="Analysis language (required): 'es', 'en' or 'zh'.",
    )
    source_filename: Optional[str] = Field(
        default=None,
        description="Original .docx filename, for traceability.",
    )
    options: AnalysisOptions = Field(default_factory=AnalysisOptions)


class AnalysisMetadata(BaseModel):
    """Bookkeeping returned alongside the analysis tree."""

    total_layers: int = Field(default=0, description="Count of layers produced.")
    total_runs: int = Field(
        default=0,
        description="Number of Gemini iterations executed.",
    )
    model: str = Field(default="", description="Gemini model actually used.")
    language: Language = Field(default="es", description="Analysis language used.")
    source_filename: Optional[str] = Field(default=None)
    structural_themes: List[str] = Field(
        default_factory=list,
        description=(
            "Structural sections/phases extracted by the Pass 0 pre-pass (empty "
            "when the structural pass was disabled). Persisted so future fusions "
            "can carry each project's structure forward."
        ),
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="UTC timestamp when the response was generated.",
    )


class AnalysisResponse(BaseModel):
    """Top-level contract returned by POST /api/analyze-transcript."""

    request_id: str = Field(..., description="Identifier for this analysis job.")
    status: AnalysisStatus = Field(
        default=AnalysisStatus.COMPLETED,
        description="Lifecycle status of the job.",
    )
    root_layer: AnalysisLayer = Field(
        ...,
        description="Root of the recursive analysis tree (level 0).",
    )
    metadata: AnalysisMetadata = Field(default_factory=AnalysisMetadata)


# --------------------------------------------------------------------------- #
# Project fusion (merge several analyses into shared macro-themes)
# --------------------------------------------------------------------------- #
class MergeConcept(BaseModel):
    """One accepted (winning) concept contributed by a source project."""

    label: str = Field(..., description="Concept name.")
    justification: str = Field(
        default="", description="Why the concept was grouped (grouping rationale)."
    )
    quotes: List[str] = Field(
        default_factory=list,
        description="Verbatim supporting phrases for the concept.",
    )


class MergeProject(BaseModel):
    """The accepted concepts of one analyzed document feeding the fusion."""

    source_filename: Optional[str] = Field(default=None)
    concepts: List[MergeConcept] = Field(default_factory=list)


class MergeRequest(BaseModel):
    """
    Payload for POST /api/merge-projects: the accepted concepts of >= 2 projects.

    The backend assembles a synthetic corpus from these concepts and runs the
    multi-layer thematic analysis (with extra forced passes) over it to surface
    the macro-themes the projects share.
    """

    projects: List[MergeProject] = Field(
        ...,
        min_length=2,
        description="At least two projects to fuse.",
    )
    language: Language = Field(..., description="Analysis language ('es'/'en'/'zh').")
    options: AnalysisOptions = Field(default_factory=AnalysisOptions)


# Resolve the forward reference used for recursion (`sub_layers`).
AnalysisLayer.model_rebuild()
