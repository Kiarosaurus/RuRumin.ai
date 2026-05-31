"""
Prompt templates for the Gemini thematic-analysis calls (multilingual).

A single analysis runs entirely in one language (es / en / zh): the document,
the produced concept names and the justifications are all in that language.

CRITICAL INVARIANT — regardless of the analysis language, the JSON *keys* of
the output MUST stay in Spanish exactly as in the schema below
(`conceptos_ganadores`, `k_top_score`, `motivo_descarte`, ...). Pydantic
(`app.llm_schema`) validates those exact keys; localizing them would break the
pipeline. Only the *values* (concept names, `justificacion_agrupacion`,
`analisis_descarte`) are written in the selected language.

Literal `{{`/`}}` braces in the schema are doubled so `str.format` leaves them
intact and only `{current_layer}` / `{interview_text_chunk}` / `{k_top}` are
substituted.
"""

from __future__ import annotations

from app.models import Language

# The output schema is identical for every language: keys stay in Spanish.
_JSON_SCHEMA_BLOCK = """\
{{
  "layer_level": {current_layer},
  "conceptos_ganadores": [
    {{
      "nombre_concepto": "...",
      "k_top_score": 0.0,
      "frases_origen": ["...", "..."],
      "justificacion_agrupacion": "..."
    }}
  ],
  "conceptos_descartados": [
    {{
      "idea_descartada": "...",
      "motivo_descarte": "...",
      "frases_origen": ["...", "..."],
      "analisis_descarte": "..."
    }}
  ]
}}"""

# Per-language instruction body (role + rules). Each ends right before the
# JSON schema block, which is appended verbatim.
_INSTRUCTIONS: dict[Language, str] = {
    "es": """\
Rol: Eres un Investigador Cualitativo Experto y un Analista de Datos Avanzado. \
Realiza un análisis temático riguroso y exhaustivo de transcripciones de entrevistas.

Contexto: Estás operando en el Layer {current_layer} de un análisis de múltiples \
fases. Agrupa las ideas y frases del texto en conceptos más amplios usando una \
métrica k-top para determinar los temas más fuertes y relevantes.

Reglas:
- Extracción y Agrupación: identifica todas las ideas base y agrúpalas en \
conceptos superiores coherentes.
- Conceptos Ganadores (k-top): selecciona los {k_top} conceptos más fuertes. \
Para cada uno asigna "k_top_score": un float entre 0.0 y 1.0 (mayor = más fuerte) \
y explica detalladamente en "justificacion_agrupacion" por qué se agruparon.
- Conceptos Descartados: identifica las ideas tangenciales o débiles que no \
superaron el umbral. Para cada una asigna "motivo_descarte" (categoría corta, \
ej. "redundante", "fuera_de_contexto") y un "analisis_descarte" crítico que \
justifique por qué fue correcto descartarla.""",
    "en": """\
Role: You are an Expert Qualitative Researcher and Advanced Data Analyst. \
Perform a rigorous, exhaustive thematic analysis of interview transcripts.

Context: You are operating at Layer {current_layer} of a multi-phase analysis. \
Group the ideas and phrases in the text into broader concepts using a k-top \
metric to determine the strongest, most relevant themes.

Rules:
- Extraction & Grouping: identify every base idea and group them into coherent \
higher-level concepts.
- Winning Concepts (k-top): select the {k_top} strongest concepts. For each, \
assign "k_top_score": a float between 0.0 and 1.0 (higher = stronger) and \
explain thoroughly in "justificacion_agrupacion" why they were grouped.
- Discarded Concepts: identify tangential or weak ideas that did not pass the \
threshold. For each, assign "motivo_descarte" (a short category, e.g. \
"redundante", "fuera_de_contexto") and a critical "analisis_descarte" \
justifying why discarding it was correct.""",
    "zh": """\
角色：你是一名资深定性研究专家和高级数据分析师。请对访谈记录进行严谨、详尽的主题分析。

背景：你正在多阶段分析的第 {current_layer} 层（Layer）。请使用 k-top 指标，\
将文本中的观点和语句归纳为更宏观的概念，以确定最强、最相关的主题。

规则：
- 提取与归纳：识别所有基础观点，并将其归纳为连贯的上层概念。
- 胜出概念（k-top）：选出最强的 {k_top} 个概念。为每个概念赋予 "k_top_score"：\
一个 0.0 到 1.0 之间的浮点数（越大越强），并在 "justificacion_agrupacion" 中\
详细说明归纳理由。
- 被舍弃的概念：识别未达到阈值的边缘或薄弱观点。为每个赋予 "motivo_descarte"\
（简短类别，例如 "redundante"、"fuera_de_contexto"），并提供批判性的 \
"analisis_descarte"，说明舍弃它为何是正确的。""",
}

# Hard, language-specific directive enforcing Spanish keys + localized values.
_KEY_DIRECTIVE: dict[Language, str] = {
    "es": """\
RESTRICCIÓN DE SALIDA (INVIOLABLE):
- Responde ÚNICA y EXCLUSIVAMENTE con un objeto JSON válido, sin Markdown.
- Las CLAVES del JSON deben permanecer EXACTAMENTE en español como en el \
esquema (conceptos_ganadores, nombre_concepto, k_top_score, frases_origen, \
justificacion_agrupacion, conceptos_descartados, idea_descartada, \
motivo_descarte, analisis_descarte, layer_level). NO traduzcas las claves.
- Los VALORES (nombres de concepto, justificaciones, frases) van en ESPAÑOL.""",
    "en": """\
OUTPUT CONSTRAINT (INVIOLABLE):
- Respond with ONE valid JSON object ONLY — no Markdown.
- The JSON KEYS must remain EXACTLY in Spanish as in the schema \
(conceptos_ganadores, nombre_concepto, k_top_score, frases_origen, \
justificacion_agrupacion, conceptos_descartados, idea_descartada, \
motivo_descarte, analisis_descarte, layer_level). DO NOT translate the keys.
- All VALUES (concept names, justifications, phrases) must be written in ENGLISH.""",
    "zh": """\
输出约束（不可违反）：
- 只能返回一个有效的 JSON 对象，不要使用 Markdown。
- JSON 的“键”（key）必须严格保持为模式中所示的西班牙语原文 \
（conceptos_ganadores、nombre_concepto、k_top_score、frases_origen、\
justificacion_agrupacion、conceptos_descartados、idea_descartada、\
motivo_descarte、analisis_descarte、layer_level）。不要翻译这些键名。
- 所有“值”（概念名称、理由说明、引用语句）必须使用中文（简体）撰写。""",
}

# Localized label that precedes the input text.
_INPUT_LABEL: dict[Language, str] = {
    "es": "Entrada a analizar:",
    "en": "Input to analyze:",
    "zh": "待分析的输入：",
}


def build_layer_prompt(
    current_layer: int,
    interview_text_chunk: str,
    k_top: int,
    language: Language,
) -> str:
    """
    Render the layer-analysis prompt for one Gemini run in `language`.

    The role/rules and the key directive are localized; the JSON schema (with
    Spanish keys) is invariant across languages.
    """
    instructions = _INSTRUCTIONS[language].format(
        current_layer=current_layer,
        k_top=k_top,
    )
    schema = _JSON_SCHEMA_BLOCK.format(current_layer=current_layer)
    directive = _KEY_DIRECTIVE[language]
    label = _INPUT_LABEL[language]
    return (
        f"{instructions}\n\n{directive}\n\n{schema}\n{label}\n"
        f'"{interview_text_chunk}"\n'
    )
