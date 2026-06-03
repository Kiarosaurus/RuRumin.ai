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
Para cada uno asigna "k_top_score": un float entre 0.0 y 1.0 (mayor = más \
fuerte) y desarrolla en "justificacion_agrupacion" una explicación EXTENSA, \
analítica y profunda de AL MENOS 3 a 4 párrafos bien desarrollados: por qué se \
agruparon esas ideas, qué patrones, tensiones y matices revelan, su relevancia \
para el tema y cómo se conectan con el resto de la entrevista.
- Densidad de evidencia (frases_origen): extrae la MAYOR cantidad posible de \
frases_origen textuales por cada concepto — muchas, no pocas. Incluye TODA \
frase, oración o fragmento del texto que sustente el concepto, aunque el aporte \
sea parcial o algo redundante; prioriza SIEMPRE la exhaustividad sobre la \
escasez y nunca te limites a 1 o 2 citas cuando el texto ofrece más.
- Superposición (Overlap): una misma frase u oración (frase_origen) PUEDE y \
DEBE pertenecer a múltiples conceptos_ganadores si su significado aporta a más \
de un tema. Se permite la superposición total o parcial de frases entre \
conceptos; no fuerces que cada frase pertenezca a un solo concepto.
- Conceptos Descartados: identifica las ideas tangenciales o débiles que no \
superaron el umbral. Para cada una asigna "motivo_descarte" (categoría corta, \
ej. "redundante", "fuera_de_contexto") y un "analisis_descarte" crítico, \
EXTENSO y profundo de AL MENOS 3 a 4 párrafos que justifique por qué fue \
correcto descartarla.
- Deduplicación: fusiona en uno solo los conceptos casi idénticos y elimina las \
frases de origen repetidas; nunca devuelvas dos conceptos ganadores que \
signifiquen lo mismo.""",
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
develop in "justificacion_agrupacion" an EXTENSIVE, analytical and deep \
explanation of AT LEAST 3 to 4 well-developed paragraphs: why those ideas were \
grouped, what patterns, tensions and nuances they reveal, their relevance to \
the theme and how they connect to the rest of the interview.
- Evidence density (frases_origen): extract as MANY verbatim frases_origen as \
possible per concept — many, not few. Include EVERY phrase, sentence or \
fragment of the text that supports the concept, even partial or somewhat \
redundant ones; ALWAYS prioritize exhaustiveness over scarcity and never settle \
for 1 or 2 quotes when the text offers more.
- Overlap: the same sentence or phrase (frase_origen) CAN and MUST belong to \
multiple conceptos_ganadores when its meaning contributes to more than one \
theme. Total or partial overlap of phrases across concepts is allowed; do not \
force each phrase into a single concept.
- Discarded Concepts: identify tangential or weak ideas that did not pass the \
threshold. For each, assign "motivo_descarte" (a short category, e.g. \
"redundante", "fuera_de_contexto") and a critical, EXTENSIVE and deep \
"analisis_descarte" of AT LEAST 3 to 4 paragraphs justifying why discarding it \
was correct.
- Deduplication: merge near-identical concepts into a single one and remove \
repeated supporting phrases; never return two winning concepts that mean the \
same thing.""",
    "zh": """\
角色：你是一名資深定性研究專家和高級資料分析師。請對訪談記錄進行嚴謹、詳盡的主題分析。

背景：你正在多階段分析的第 {current_layer} 層（Layer）。請使用 k-top 指標，\
將文本中的觀點和語句歸納為更宏觀的概念，以確定最強、最相關的主題。

規則：
- 提取與歸納：識別所有基礎觀點，並將其歸納為連貫的上層概念。
- 勝出概念（k-top）：選出最強的 {k_top} 個概念。為每個概念賦予 "k_top_score"：\
一個 0.0 到 1.0 之間的浮點數（越大越強），並在 "justificacion_agrupacion" 中\
撰寫至少 3 至 4 個充分展開段落的詳盡、深入且具分析性的說明：為何如此歸納、揭示\
了哪些模式、張力與細微差異、對主題的重要性，以及與整場訪談其餘部分的關聯。
- 證據密度（frases_origen）：為每個概念盡可能提取最多的原文 frases_origen——\
要多，不要少。納入文本中所有支持該概念的語句、句子或片段，即使貢獻只是部分或\
略有重複也要包含；務必優先追求詳盡而非簡略，當文本能提供更多引用時，切勿只給 \
1 至 2 句。
- 重疊（Overlap）：同一個句子或語句（frase_origen）只要其含義對多個主題有貢獻，\
就可以且應該屬於多個 conceptos_ganadores。允許概念之間的語句完全或部分重疊；\
不要強迫每個語句只屬於單一概念。
- 被捨棄的概念：識別未達到閾值的邊緣或薄弱觀點。為每個賦予 "motivo_descarte"\
（簡短類別，例如 "redundante"、"fuera_de_contexto"），並提供至少 3 至 4 個段落\
批判性、詳盡且深入的 "analisis_descarte"，說明捨棄它為何是正確的。
- 去重：將幾乎相同的概念合併為一個，並移除重複的來源語句；切勿返回兩個語意相同的\
勝出概念。""",
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
輸出約束（不可違反）：
- 只能返回一個有效的 JSON 物件，不要使用 Markdown。
- JSON 的「鍵」（key）必須嚴格保持為模式中所示的西班牙語原文 \
（conceptos_ganadores、nombre_concepto、k_top_score、frases_origen、\
justificacion_agrupacion、conceptos_descartados、idea_descartada、\
motivo_descarte、analisis_descarte、layer_level）。不要翻譯這些鍵名。
- 所有「值」（概念名稱、理由說明、引用語句）必須使用繁體中文撰寫。""",
}

# Localized label that precedes the input text.
_INPUT_LABEL: dict[Language, str] = {
    "es": "Entrada a analizar:",
    "en": "Input to analyze:",
    "zh": "待分析的輸入：",
}

# --------------------------------------------------------------------------- #
# Pass 0 — Structural pre-pass
#
# Before the thematic layers run, an optional cheap pass reads the transcript
# and extracts its STRUCTURAL skeleton: the chapters, sections or interview
# phases the conversation is organised into (e.g. "(一）過去使用交友軟體的經驗").
# These structural_themes are then injected as context into the Layer 0 prompt so
# the model groups concepts with the interview's own structure in mind, and they
# are persisted in the analysis metadata for future fusions.
# --------------------------------------------------------------------------- #

# Output schema for Pass 0. Key stays Spanish (Pydantic invariant); values are
# verbatim section/phase headings copied from the transcript in its own language.
_STRUCTURAL_SCHEMA_BLOCK = """\
{
  "temas_estructurales": ["...", "..."]
}"""

_STRUCTURAL_INSTRUCTIONS: dict[Language, str] = {
    "es": """\
Rol: Eres un analista que mapea la ESTRUCTURA de una transcripción de entrevista.

Tarea: Lee el texto e identifica únicamente su esqueleto estructural: los \
capítulos, secciones, bloques o fases de la entrevista en los que se organiza la \
conversación (por ejemplo encabezados de tema, etapas como "(一）experiencia \
previa…", apartados numerados o preguntas-guía que abren un bloque).

Reglas:
- Copia los títulos/encabezados de sección de forma TEXTUAL tal como aparecen en \
el texto; respeta su numeración y redacción originales.
- Devuelve las secciones en el ORDEN en que aparecen.
- NO resumas el contenido ni extraigas conceptos temáticos: solo la estructura.
- Si el texto no tiene secciones explícitas, infiere de 3 a 6 fases naturales de \
la entrevista y descríbelas con frases cortas.""",
    "en": """\
Role: You are an analyst who maps the STRUCTURE of an interview transcript.

Task: Read the text and identify only its structural skeleton: the chapters, \
sections, blocks or interview phases the conversation is organised into (e.g. \
topic headings, stages such as "(一）prior experience…", numbered sections or \
guiding questions that open a block).

Rules:
- Copy the section titles/headings VERBATIM as they appear in the text; keep \
their original numbering and wording.
- Return the sections in the ORDER they appear.
- Do NOT summarise the content or extract thematic concepts: structure only.
- If the text has no explicit sections, infer 3 to 6 natural interview phases \
and describe each with a short phrase.""",
    "zh": """\
角色：你是一名分析師，負責標示訪談記錄的「結構」。

任務：閱讀文本，僅辨識其結構骨架：對話所組織的章節、段落、區塊或訪談階段\
（例如主題標題、像「(一）過去使用交友軟體的經驗」這樣的階段、編號小節，\
或開啟某一區塊的引導問題）。

規則：
- 逐字（VERBATIM）複製文本中出現的段落標題／小標，保留其原始編號與用字。
- 依照它們在文本中出現的「順序」返回。
- 不要摘要內容，也不要提取主題概念：只要結構。
- 若文本沒有明確的分節，請推斷 3 至 6 個自然的訪談階段，並各用一句短語描述。""",
}

# Hard directive for Pass 0: JSON only, single Spanish key.
_STRUCTURAL_DIRECTIVE: dict[Language, str] = {
    "es": (
        "RESTRICCIÓN DE SALIDA (INVIOLABLE): responde ÚNICA y EXCLUSIVAMENTE con "
        "un objeto JSON válido, sin Markdown. La clave debe ser EXACTAMENTE "
        '"temas_estructurales" (en español) y su valor una lista de strings.'
    ),
    "en": (
        "OUTPUT CONSTRAINT (INVIOLABLE): respond with ONE valid JSON object ONLY, "
        'no Markdown. The key must be EXACTLY "temas_estructurales" (in Spanish) '
        "and its value a list of strings."
    ),
    "zh": (
        "輸出約束（不可違反）：只能返回一個有效的 JSON 物件，不要使用 Markdown。"
        '鍵必須嚴格為 "temas_estructurales"（西班牙語），其值為字串陣列。'
    ),
}

# Localized header for the structural-context block injected into Layer 0.
_STRUCTURAL_CONTEXT_LABEL: dict[Language, str] = {
    "es": (
        "Estructura de la entrevista (secciones/fases detectadas en una pasada "
        "previa). Considéralas para agrupar los conceptos respetando el hilo "
        "estructural del texto:"
    ),
    "en": (
        "Interview structure (sections/phases detected in a previous pass). Take "
        "them into account when grouping concepts so the structural thread of the "
        "text is respected:"
    ),
    "zh": (
        "訪談結構（在前一次預先掃描中偵測到的段落／階段）。請在歸納概念時將其納入考量，"
        "以尊重文本的結構脈絡："
    ),
}


def build_structural_prompt(transcript_text: str, language: Language) -> str:
    """
    Render the Pass 0 prompt that extracts the transcript's structural skeleton.

    The model returns a single JSON object ``{"temas_estructurales": [...]}`` whose
    values are verbatim section/phase headings in `language`. Validated by
    `app.llm_schema.StructuralLLMOutput`.
    """
    instructions = _STRUCTURAL_INSTRUCTIONS[language]
    directive = _STRUCTURAL_DIRECTIVE[language]
    label = _INPUT_LABEL[language]
    return (
        f"{instructions}\n\n{directive}\n\n{_STRUCTURAL_SCHEMA_BLOCK}\n{label}\n"
        f'"{transcript_text}"\n'
    )


def _structural_context_block(
    structural_themes: list[str] | None, language: Language
) -> str:
    """Render the injected structural-context block, or '' when there is none."""
    themes = [t.strip() for t in (structural_themes or []) if t.strip()]
    if not themes:
        return ""
    bullets = "\n".join(f"- {t}" for t in themes)
    return f"{_STRUCTURAL_CONTEXT_LABEL[language]}\n{bullets}"

# Appended only on the LAST layer: force convergence into a single general
# concept (the root idea that summarizes the whole interview).
_FINAL_LAYER_DIRECTIVE: dict[Language, str] = {
    "es": (
        "IMPORTANTE — LAYER FINAL: Este es el último layer del análisis. Converge "
        "TODOS los temas previos en UN ÚNICO concepto general y abarcador que "
        "sintetice la idea central de toda la entrevista. Devuelve exactamente 1 "
        "concepto ganador."
    ),
    "en": (
        "IMPORTANT — FINAL LAYER: This is the last layer of the analysis. Converge "
        "ALL prior themes into ONE single overarching general concept that "
        "synthesizes the central idea of the whole interview. Return exactly 1 "
        "winning concept."
    ),
    "zh": (
        "重要——最終層級：這是分析的最後一層。請將先前所有主題收斂為一個單一、涵蓋全局的"
        "總體概念，概括整場訪談的核心思想。僅返回 1 個勝出概念。"
    ),
}


def build_layer_prompt(
    current_layer: int,
    interview_text_chunk: str,
    k_top: int,
    language: Language,
    max_layers: int = 5,
    structural_themes: list[str] | None = None,
) -> str:
    """
    Render the layer-analysis prompt for one Gemini run in `language`.

    The role/rules and the key directive are localized; the JSON schema (with
    Spanish keys) is invariant across languages. On the final layer
    (`current_layer == max_layers - 1`) a directive is appended instructing the
    model to converge everything into a single general concept.

    When `structural_themes` is provided (Pass 0 output, injected only on the
    base layer by the orchestrator) a structural-context block is added so the
    model groups concepts in line with the interview's own sections/phases.
    """
    instructions = _INSTRUCTIONS[language].format(
        current_layer=current_layer,
        k_top=k_top,
    )
    if current_layer >= max_layers - 1:
        instructions = f"{instructions}\n\n{_FINAL_LAYER_DIRECTIVE[language]}"
    context = _structural_context_block(structural_themes, language)
    if context:
        instructions = f"{instructions}\n\n{context}"
    schema = _JSON_SCHEMA_BLOCK.format(current_layer=current_layer)
    directive = _KEY_DIRECTIVE[language]
    label = _INPUT_LABEL[language]
    return (
        f"{instructions}\n\n{directive}\n\n{schema}\n{label}\n"
        f'"{interview_text_chunk}"\n'
    )
