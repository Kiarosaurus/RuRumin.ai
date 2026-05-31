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

from pydantic import BaseModel, Field

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
        default=3,
        ge=1,
        le=10,
        description="Maximum recursion depth of the analysis tree.",
    )
    k_top: int = Field(
        default=5,
        ge=1,
        description="Number of winning concepts to keep per layer.",
    )
    model: str = Field(
        default="gemini-2.5-pro",
        description="Identifier of the Gemini model to invoke.",
    )


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


# Resolve the forward reference used for recursion (`sub_layers`).
AnalysisLayer.model_rebuild()
