"""
Validation schema for the *raw* Gemini layer output.

This mirrors exactly the JSON shape requested in `prompts.LAYER_ANALYSIS_PROMPT`
(Spanish keys). It is deliberately separate from the public transport contract
in `app.models`: the LLM output is an untrusted, model-facing format, while
`app.models` is the stable wire format the frontend consumes.
`app.services.mapping` translates the former into the latter.
"""

from __future__ import annotations

from typing import List

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


class GanadorLLM(BaseModel):
    """A winning concept as emitted by the model."""

    nombre_concepto: str = Field(..., description="Nombre del concepto agrupado.")
    k_top_score: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Peso/relevancia del concepto según la métrica k-top (0.0-1.0).",
    )
    frases_origen: List[str] = Field(
        default_factory=list,
        description="Frases del texto que sustentan el concepto.",
    )
    justificacion_agrupacion: str = Field(
        ...,
        description="Por qué estas ideas se agruparon bajo este concepto.",
    )


class DescartadoLLM(BaseModel):
    """
    A discarded concept as emitted by the model.

    Accepts common near-miss key spellings the model drifts to (observed in
    production, more frequent on non-Spanish analysis languages): e.g.
    `idea_descarte` for `idea_descartada`. Aliases keep one bad key from sinking
    an otherwise valid layer. `populate_by_name` keeps the canonical names usable.
    """

    model_config = ConfigDict(populate_by_name=True)

    idea_descartada: str = Field(
        ...,
        validation_alias=AliasChoices("idea_descartada", "idea_descarte"),
        description="Idea tangencial o débil.",
    )
    motivo_descarte: str = Field(
        ...,
        validation_alias=AliasChoices("motivo_descarte", "motivo"),
        description="Categoría corta del motivo de descarte (ej. 'redundante').",
    )
    frases_origen: List[str] = Field(
        default_factory=list,
        description="Frases asociadas a la idea descartada.",
    )
    analisis_descarte: str = Field(
        ...,
        validation_alias=AliasChoices("analisis_descarte", "analisis_descartado"),
        description="Análisis crítico de por qué el descarte fue correcto.",
    )


class StructuralLLMOutput(BaseModel):
    """
    JSON object returned by the Pass 0 structural pre-pass.

    A single Spanish key `temas_estructurales` holding the verbatim section/phase
    headings the model detected in the transcript. Tolerates the near-miss key
    `secciones` the model occasionally drifts to.
    """

    model_config = ConfigDict(populate_by_name=True)

    temas_estructurales: List[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("temas_estructurales", "secciones"),
        description="Encabezados de sección/fase detectados en la transcripción.",
    )

    @classmethod
    def parse_model_text(cls, raw_text: str) -> "StructuralLLMOutput":
        """Parse/validate raw model text, tolerating a ```json fenced block."""
        cleaned = raw_text.strip()
        if cleaned.startswith("```"):
            lines = cleaned.splitlines()
            if lines and lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            cleaned = "\n".join(lines).strip()
        return cls.model_validate_json(cleaned)


class LayerLLMOutput(BaseModel):
    """Full JSON object returned by one Gemini layer run."""

    layer_level: int = Field(..., ge=0)
    conceptos_ganadores: List[GanadorLLM] = Field(default_factory=list)
    conceptos_descartados: List[DescartadoLLM] = Field(default_factory=list)

    @classmethod
    def parse_model_text(cls, raw_text: str) -> "LayerLLMOutput":
        """
        Parse and validate raw model text into a `LayerLLMOutput`.

        Tolerates the common case where the model wraps JSON in a ```json
        fenced block despite the "JSON only" instruction.
        """
        cleaned = raw_text.strip()
        if cleaned.startswith("```"):
            # Drop the opening fence (``` or ```json) and the closing fence.
            lines = cleaned.splitlines()
            if lines and lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            cleaned = "\n".join(lines).strip()
        return cls.model_validate_json(cleaned)
