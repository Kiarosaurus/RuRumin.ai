/**
 * Lightweight UI internationalization.
 *
 * One flat dictionary per supported language. `tr(lang, key, vars)` looks up a
 * string and interpolates `{name}`-style placeholders, falling back to Spanish
 * when a key is missing.
 */

import type { Language } from "../types";

export type UIKey =
  | "nav.home"
  | "nav.summary"
  | "nav.details"
  | "nav.tree"
  | "home.title"
  | "home.language"
  | "home.import"
  | "home.analyzing"
  | "home.layers"
  | "status.processed"
  | "status.processing"
  | "status.failed"
  | "status.reanalyzing"
  | "action.open"
  | "action.reanalyze"
  | "action.newAnalysisHint"
  | "action.delete"
  | "reader.summaryTitle"
  | "reader.detailsTitle"
  | "reader.layers"
  | "reader.analysis"
  | "reader.analysisOption"
  | "reader.winners"
  | "reader.discards"
  | "reader.noDiscards"
  | "reader.accepted"
  | "reader.rejected"
  | "reader.ktop"
  | "reader.ideaCounter"
  | "tree.empty"
  | "tree.legendLayer"
  | "tree.legendConcept"
  | "tree.hidePhrases"
  | "tree.showPhrases"
  | "docx.unsupported"
  | "docx.empty"
  | "docx.readError"
  | "confirm.delete"
  | "toast.analyzed"
  | "toast.reanalyzed"
  | "toast.deleted"
  | "toast.noText"
  | "toast.noConnection"
  | "toast.error"
  | "toast.unexpected"
  | "progress.starting"
  | "progress.structural"
  | "progress.layer_start"
  | "progress.calling_model"
  | "progress.rate_limit_wait"
  | "progress.model_fallback"
  | "progress.validating"
  | "progress.layer_done"
  | "progress.finalizing"
  | "progress.requests"
  | "progress.layerCounter"
  | "a11y.loading"
  | "a11y.close"
  | "lang.es"
  | "lang.en"
  | "lang.zh"
  | "config.title"
  | "config.intro"
  | "config.auto"
  | "config.autoDesc"
  | "config.manual"
  | "config.manualDesc"
  | "config.structural"
  | "config.layersCount"
  | "config.layer"
  | "config.base"
  | "config.apex"
  | "config.apexFixed"
  | "config.pyramidHint"
  | "config.start"
  | "config.cancel"
  | "quota.button"
  | "quota.open"
  | "quota.title"
  | "quota.intro"
  | "quota.remaining"
  | "quota.usesLeft"
  | "quota.strengths"
  | "quota.weaknesses"
  | "quota.use"
  | "quota.active"
  | "quota.close"
  | "quota.activeModel"
  | "fusion.tag"
  | "fusion.button"
  | "fusion.select"
  | "fusion.needTwo"
  | "fusion.created"
  | "fusion.name";

const ES: Record<UIKey, string> = {
  "nav.home": "Inicio",
  "nav.summary": "Resumen",
  "nav.details": "Detalles",
  "nav.tree": "Árbol",
  "home.title": "Repositorio de documentos",
  "home.language": "Idioma de análisis",
  "home.import": "+ Importar .docx",
  "home.analyzing": "Analizando…",
  "home.layers": "Layers",
  "status.processed": "Procesado",
  "status.processing": "Procesando…",
  "status.failed": "Error",
  "status.reanalyzing": "Re-analizando…",
  "action.open": "Abrir",
  "action.reanalyze": "Nuevo análisis",
  "action.newAnalysisHint": "Crear un nuevo análisis con {layers} layers",
  "action.delete": "Eliminar",
  "reader.summaryTitle": "Resumen — frases ganadoras",
  "reader.detailsTitle": "Detalles — frases descartadas",
  "reader.layers": "Layers",
  "reader.analysis": "Análisis",
  "reader.analysisOption": "Análisis {n} ({layers} Layers)",
  "reader.winners": "Conceptos ganadores",
  "reader.discards": "Análisis de descartes",
  "reader.accepted": "Aceptados",
  "reader.rejected": "Rechazados",
  "reader.noDiscards": "Sin descartes en este layer.",
  "reader.ktop": "k-top",
  "reader.ideaCounter": "Idea {current} / {total}",
  "tree.empty": "No hay datos para mostrar.",
  "tree.legendLayer": "Layer",
  "tree.legendConcept": "Concepto",
  "tree.hidePhrases": "Esconder frases",
  "tree.showPhrases": "Mostrar frases",
  "docx.unsupported": 'Solo se admiten documentos Word .docx. Recibido: "{name}".',
  "docx.empty": 'El documento "{name}" no contiene texto extraíble.',
  "docx.readError": 'No se pudo leer el documento "{name}".',
  "confirm.delete": "¿Eliminar este documento del repositorio?",
  "toast.analyzed": '"{name}" analizado.',
  "toast.reanalyzed": '"{name}" re-analizado.',
  "toast.deleted": "Documento eliminado.",
  "toast.noText": "No hay texto almacenado para re-analizar.",
  "toast.noConnection": "No hay conexión con el servidor",
  "toast.error": "Error {status}",
  "toast.unexpected": "Fallo inesperado",
  "progress.starting": "Preparando análisis…",
  "progress.structural": "Detectando la estructura de la entrevista (Pasada 0)…",
  "progress.layer_start": "Analizando layer {layer} de {max}…",
  "progress.calling_model":
    "Consultando a {model} · Run {run}/{runs} (intento {attempt})…",
  "progress.rate_limit_wait":
    "Límite de {rpm} req/min en {model}. Durmiendo {seconds} s…",
  "progress.model_fallback": "{model} agotado. Cambiando a {next}…",
  "progress.validating": "Validando respuesta del layer {layer}…",
  "progress.layer_done": "Layer {layer} completado.",
  "progress.finalizing": "Actualizando vistas…",
  "progress.requests": "Solicitudes a Gemini: {count}",
  "progress.layerCounter": "Layer {layer} / {max}",
  "a11y.loading": "Cargando",
  "a11y.close": "Cerrar",
  "lang.es": "Español",
  "lang.en": "Inglés",
  "lang.zh": "Mandarín",
  "config.title": "Configuración del análisis",
  "config.intro": "¿Cómo configurar el análisis de «{name}»?",
  "config.auto": "Automática",
  "config.autoDesc": "Gemini decide la estructura (mínimo 3 capas).",
  "config.manual": "Manual",
  "config.manualDesc": "Define cuántos conceptos tendrá cada capa.",
  "config.structural":
    "Considerar los temas/secciones estructurales de la entrevista (1 pasada de IA extra)",
  "config.layersCount": "Número de capas",
  "config.layer": "Capa {n}",
  "config.base": "base",
  "config.apex": "cúspide",
  "config.apexFixed": "1 concepto (fijo)",
  "config.pyramidHint":
    "Cada capa superior tiene menos conceptos; la cúspide siempre converge en 1.",
  "config.start": "Analizar",
  "config.cancel": "Cancelar",
  "quota.button": "IA",
  "quota.open": "Cuotas de modelos de IA",
  "quota.title": "Modelos de IA y cuota diaria",
  "quota.intro": "Usos restantes hoy por modelo (se reinician cada día).",
  "quota.remaining": "Usos restantes",
  "quota.usesLeft": "{left} / {total} hoy",
  "quota.strengths": "Fortalezas",
  "quota.weaknesses": "Debilidades",
  "quota.use": "Usar este modelo",
  "quota.active": "Activo",
  "quota.close": "Cerrar",
  "quota.activeModel": "Modelo activo: {name}",
  "fusion.tag": "Fusión",
  "fusion.button": "Fusionar",
  "fusion.select": "Seleccionar para fusionar",
  "fusion.needTwo": "Selecciona al menos 2 proyectos para fusionar.",
  "fusion.created": "«{name}» creada.",
  "fusion.name": "Fusión de {count} proyectos",
};

const EN: Record<UIKey, string> = {
  "nav.home": "Home",
  "nav.summary": "Summary",
  "nav.details": "Details",
  "nav.tree": "Tree",
  "home.title": "Document repository",
  "home.language": "Analysis language",
  "home.import": "+ Import .docx",
  "home.analyzing": "Analyzing…",
  "home.layers": "Layers",
  "status.processed": "Processed",
  "status.processing": "Processing…",
  "status.failed": "Error",
  "status.reanalyzing": "Re-analyzing…",
  "action.open": "Open",
  "action.reanalyze": "New analysis",
  "action.newAnalysisHint": "Run a new analysis with {layers} layers",
  "action.delete": "Delete",
  "reader.summaryTitle": "Summary — winning phrases",
  "reader.detailsTitle": "Details — discarded phrases",
  "reader.layers": "Layers",
  "reader.analysis": "Analysis",
  "reader.analysisOption": "Analysis {n} ({layers} Layers)",
  "reader.winners": "Winning concepts",
  "reader.discards": "Discard analysis",
  "reader.accepted": "Accepted",
  "reader.rejected": "Rejected",
  "reader.noDiscards": "No discards in this layer.",
  "reader.ktop": "k-top",
  "reader.ideaCounter": "Idea {current} / {total}",
  "tree.empty": "No data to display.",
  "tree.legendLayer": "Layer",
  "tree.legendConcept": "Concept",
  "tree.hidePhrases": "Hide phrases",
  "tree.showPhrases": "Show phrases",
  "docx.unsupported": 'Only Word .docx documents are supported. Received: "{name}".',
  "docx.empty": 'The document "{name}" has no extractable text.',
  "docx.readError": 'Could not read the document "{name}".',
  "confirm.delete": "Delete this document from the repository?",
  "toast.analyzed": '"{name}" analyzed.',
  "toast.reanalyzed": '"{name}" re-analyzed.',
  "toast.deleted": "Document deleted.",
  "toast.noText": "No stored text to re-analyze.",
  "toast.noConnection": "No connection to the server",
  "toast.error": "Error {status}",
  "toast.unexpected": "Unexpected failure",
  "progress.starting": "Preparing analysis…",
  "progress.structural": "Detecting the interview's structure (Pass 0)…",
  "progress.layer_start": "Analyzing layer {layer} of {max}…",
  "progress.calling_model":
    "Calling {model} · Run {run}/{runs} (attempt {attempt})…",
  "progress.rate_limit_wait":
    "{rpm} req/min limit on {model}. Sleeping {seconds} s…",
  "progress.model_fallback": "{model} exhausted. Switching to {next}…",
  "progress.validating": "Validating layer {layer} response…",
  "progress.layer_done": "Layer {layer} done.",
  "progress.finalizing": "Updating views…",
  "progress.requests": "Gemini requests: {count}",
  "progress.layerCounter": "Layer {layer} / {max}",
  "a11y.loading": "Loading",
  "a11y.close": "Close",
  "lang.es": "Spanish",
  "lang.en": "English",
  "lang.zh": "Mandarin",
  "config.title": "Analysis configuration",
  "config.intro": "How should “{name}” be analyzed?",
  "config.auto": "Automatic",
  "config.autoDesc": "Gemini decides the structure (minimum 3 layers).",
  "config.manual": "Manual",
  "config.manualDesc": "Set how many concepts each layer keeps.",
  "config.structural":
    "Consider the interview's structural themes/sections (1 extra AI pass)",
  "config.layersCount": "Number of layers",
  "config.layer": "Layer {n}",
  "config.base": "base",
  "config.apex": "apex",
  "config.apexFixed": "1 concept (fixed)",
  "config.pyramidHint":
    "Each upper layer keeps fewer concepts; the apex always converges to 1.",
  "config.start": "Analyze",
  "config.cancel": "Cancel",
  "quota.button": "AI",
  "quota.open": "AI model quotas",
  "quota.title": "AI models & daily quota",
  "quota.intro": "Uses remaining today per model (they reset every day).",
  "quota.remaining": "Uses remaining",
  "quota.usesLeft": "{left} / {total} today",
  "quota.strengths": "Strengths",
  "quota.weaknesses": "Weaknesses",
  "quota.use": "Use this model",
  "quota.active": "Active",
  "quota.close": "Close",
  "quota.activeModel": "Active model: {name}",
  "fusion.tag": "Fusion",
  "fusion.button": "Merge projects",
  "fusion.select": "Select to merge",
  "fusion.needTwo": "Select at least 2 projects to merge.",
  "fusion.created": "“{name}” created.",
  "fusion.name": "Fusion of {count} projects",
};

const ZH: Record<UIKey, string> = {
  "nav.home": "主頁",
  "nav.summary": "摘要",
  "nav.details": "詳情",
  "nav.tree": "樹狀圖",
  "home.title": "文件庫",
  "home.language": "分析語言",
  "home.import": "+ 匯入 .docx",
  "home.analyzing": "分析中…",
  "home.layers": "層數",
  "status.processed": "已處理",
  "status.processing": "處理中…",
  "status.failed": "錯誤",
  "status.reanalyzing": "重新分析中…",
  "action.open": "開啟",
  "action.reanalyze": "新增分析",
  "action.newAnalysisHint": "以 {layers} 層執行新的分析",
  "action.delete": "刪除",
  "reader.summaryTitle": "摘要 — 勝出語句",
  "reader.detailsTitle": "詳情 — 被捨棄語句",
  "reader.layers": "層級",
  "reader.analysis": "分析",
  "reader.analysisOption": "分析 {n}（{layers} 層）",
  "reader.winners": "勝出概念",
  "reader.discards": "捨棄分析",
  "reader.accepted": "已接受",
  "reader.rejected": "已拒絕",
  "reader.noDiscards": "該層沒有被捨棄的概念。",
  "reader.ktop": "k-top",
  "reader.ideaCounter": "想法 {current} / {total}",
  "tree.empty": "暫無可顯示的資料。",
  "tree.legendLayer": "層級",
  "tree.legendConcept": "概念",
  "tree.hidePhrases": "隱藏語句",
  "tree.showPhrases": "顯示語句",
  "docx.unsupported": "僅支援 Word .docx 文件。收到的是：「{name}」。",
  "docx.empty": "文件「{name}」沒有可擷取的文字。",
  "docx.readError": "無法讀取文件「{name}」。",
  "confirm.delete": "確定要從文件庫中刪除此文件嗎？",
  "toast.analyzed": "「{name}」已分析。",
  "toast.reanalyzed": "「{name}」已重新分析。",
  "toast.deleted": "文件已刪除。",
  "toast.noText": "沒有可重新分析的文字。",
  "toast.noConnection": "無法連線伺服器",
  "toast.error": "錯誤 {status}",
  "toast.unexpected": "意外錯誤",
  "progress.starting": "正在準備分析…",
  "progress.structural": "正在偵測訪談的結構（第 0 次預掃描）…",
  "progress.layer_start": "正在分析第 {layer} / {max} 層…",
  "progress.calling_model":
    "正在呼叫 {model} · 第 {run}/{runs} 次執行（第 {attempt} 次嘗試）…",
  "progress.rate_limit_wait": "{model} 達到每分鐘 {rpm} 次上限。休眠 {seconds} 秒…",
  "progress.model_fallback": "{model} 已用盡。切換到 {next}…",
  "progress.validating": "正在驗證第 {layer} 層的回應…",
  "progress.layer_done": "第 {layer} 層已完成。",
  "progress.finalizing": "正在更新檢視…",
  "progress.requests": "Gemini 請求數：{count}",
  "progress.layerCounter": "第 {layer} / {max} 層",
  "a11y.loading": "載入中",
  "a11y.close": "關閉",
  "lang.es": "西班牙語",
  "lang.en": "英語",
  "lang.zh": "繁體中文",
  "config.title": "分析設定",
  "config.intro": "要如何分析「{name}」？",
  "config.auto": "自動",
  "config.autoDesc": "由 Gemini 決定結構（至少 3 層）。",
  "config.manual": "手動",
  "config.manualDesc": "設定每一層保留多少個概念。",
  "config.structural": "考量訪談的結構主題／段落（額外 1 次 AI 掃描）",
  "config.layersCount": "層數",
  "config.layer": "第 {n} 層",
  "config.base": "底層",
  "config.apex": "頂層",
  "config.apexFixed": "1 個概念（固定）",
  "config.pyramidHint": "越上層概念越少；頂層始終收斂為 1 個概念。",
  "config.start": "開始分析",
  "config.cancel": "取消",
  "quota.button": "AI",
  "quota.open": "AI 模型配額",
  "quota.title": "AI 模型與每日配額",
  "quota.intro": "各模型今日剩餘的使用次數（每天重置）。",
  "quota.remaining": "剩餘次數",
  "quota.usesLeft": "{left} / {total} 今日",
  "quota.strengths": "優勢",
  "quota.weaknesses": "劣勢",
  "quota.use": "使用此模型",
  "quota.active": "使用中",
  "quota.close": "關閉",
  "quota.activeModel": "使用中的模型：{name}",
  "fusion.tag": "融合",
  "fusion.button": "融合專案",
  "fusion.select": "選取以融合",
  "fusion.needTwo": "請至少選取 2 個專案進行融合。",
  "fusion.created": "已建立「{name}」。",
  "fusion.name": "{count} 個專案的融合",
};

const TRANSLATIONS: Record<Language, Record<UIKey, string>> = {
  es: ES,
  en: EN,
  zh: ZH,
};

/** Ordered list for rendering the language selector. */
export const LANGUAGE_OPTIONS: Language[] = ["es", "en", "zh"];

/**
 * Native language names (endonyms) shown verbatim in the language picker,
 * regardless of the active UI language. Intentionally NOT routed through `tr`:
 * a selector should always present each option in its own language.
 */
export const LANGUAGE_LABELS: Record<Language, string> = {
  es: "Español",
  en: "English",
  zh: "繁體中文",
};

/** Translate `key` into `lang`, interpolating `{var}` placeholders. */
export function tr(
  lang: Language,
  key: UIKey,
  vars?: Record<string, string | number>,
): string {
  const template = TRANSLATIONS[lang]?.[key] ?? TRANSLATIONS.es[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    name in vars ? String(vars[name]) : `{${name}}`,
  );
}
