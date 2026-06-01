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
  | "status.processed"
  | "status.processing"
  | "status.failed"
  | "status.reanalyzing"
  | "action.open"
  | "action.reanalyze"
  | "action.delete"
  | "reader.summaryTitle"
  | "reader.detailsTitle"
  | "reader.layers"
  | "reader.winners"
  | "reader.discards"
  | "reader.noDiscards"
  | "reader.ktop"
  | "tree.empty"
  | "tree.legendLayer"
  | "tree.legendConcept"
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
  | "progress.layer_start"
  | "progress.calling_model"
  | "progress.rate_limit_wait"
  | "progress.model_fallback"
  | "progress.validating"
  | "progress.layer_done"
  | "progress.finalizing"
  | "progress.requests"
  | "progress.layerCounter"
  | "lang.es"
  | "lang.en"
  | "lang.zh";

const ES: Record<UIKey, string> = {
  "nav.home": "Inicio",
  "nav.summary": "Resumen",
  "nav.details": "Detalles",
  "nav.tree": "Árbol",
  "home.title": "Repositorio de documentos",
  "home.language": "Idioma de análisis",
  "home.import": "+ Importar .docx",
  "home.analyzing": "Analizando…",
  "status.processed": "Procesado",
  "status.processing": "Procesando…",
  "status.failed": "Error",
  "status.reanalyzing": "Re-analizando…",
  "action.open": "Abrir",
  "action.reanalyze": "Re-analizar",
  "action.delete": "Eliminar",
  "reader.summaryTitle": "Resumen — frases ganadoras",
  "reader.detailsTitle": "Detalles — frases descartadas",
  "reader.layers": "Layers",
  "reader.winners": "Conceptos ganadores",
  "reader.discards": "Análisis de descartes",
  "reader.noDiscards": "Sin descartes en este layer.",
  "reader.ktop": "k-top",
  "tree.empty": "No hay datos para mostrar.",
  "tree.legendLayer": "Layer",
  "tree.legendConcept": "Concepto",
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
  "lang.es": "Español",
  "lang.en": "Inglés",
  "lang.zh": "Mandarín",
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
  "status.processed": "Processed",
  "status.processing": "Processing…",
  "status.failed": "Error",
  "status.reanalyzing": "Re-analyzing…",
  "action.open": "Open",
  "action.reanalyze": "Re-analyze",
  "action.delete": "Delete",
  "reader.summaryTitle": "Summary — winning phrases",
  "reader.detailsTitle": "Details — discarded phrases",
  "reader.layers": "Layers",
  "reader.winners": "Winning concepts",
  "reader.discards": "Discard analysis",
  "reader.noDiscards": "No discards in this layer.",
  "reader.ktop": "k-top",
  "tree.empty": "No data to display.",
  "tree.legendLayer": "Layer",
  "tree.legendConcept": "Concept",
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
  "lang.es": "Spanish",
  "lang.en": "English",
  "lang.zh": "Mandarin",
};

const ZH: Record<UIKey, string> = {
  "nav.home": "主页",
  "nav.summary": "摘要",
  "nav.details": "详情",
  "nav.tree": "树状图",
  "home.title": "文档库",
  "home.language": "分析语言",
  "home.import": "+ 导入 .docx",
  "home.analyzing": "分析中…",
  "status.processed": "已处理",
  "status.processing": "处理中…",
  "status.failed": "错误",
  "status.reanalyzing": "重新分析中…",
  "action.open": "打开",
  "action.reanalyze": "重新分析",
  "action.delete": "删除",
  "reader.summaryTitle": "摘要 — 胜出语句",
  "reader.detailsTitle": "详情 — 被舍弃语句",
  "reader.layers": "层级",
  "reader.winners": "胜出概念",
  "reader.discards": "舍弃分析",
  "reader.noDiscards": "该层没有被舍弃的概念。",
  "reader.ktop": "k-top",
  "tree.empty": "暂无可显示的数据。",
  "tree.legendLayer": "层级",
  "tree.legendConcept": "概念",
  "docx.unsupported": "仅支持 Word .docx 文档。收到的是：“{name}”。",
  "docx.empty": "文档“{name}”没有可提取的文本。",
  "docx.readError": "无法读取文档“{name}”。",
  "confirm.delete": "确定要从文档库中删除此文档吗？",
  "toast.analyzed": "“{name}” 已分析。",
  "toast.reanalyzed": "“{name}” 已重新分析。",
  "toast.deleted": "文档已删除。",
  "toast.noText": "没有可重新分析的文本。",
  "toast.noConnection": "无法连接服务器",
  "toast.error": "错误 {status}",
  "toast.unexpected": "意外错误",
  "progress.starting": "正在准备分析…",
  "progress.layer_start": "正在分析第 {layer} / {max} 层…",
  "progress.calling_model":
    "正在调用 {model} · 第 {run}/{runs} 次运行（第 {attempt} 次尝试）…",
  "progress.rate_limit_wait": "{model} 达到每分钟 {rpm} 次上限。休眠 {seconds} 秒…",
  "progress.model_fallback": "{model} 已用尽。切换到 {next}…",
  "progress.validating": "正在校验第 {layer} 层的响应…",
  "progress.layer_done": "第 {layer} 层已完成。",
  "progress.finalizing": "正在更新视图…",
  "progress.requests": "Gemini 请求数：{count}",
  "progress.layerCounter": "第 {layer} / {max} 层",
  "lang.es": "西班牙语",
  "lang.en": "英语",
  "lang.zh": "中文",
};

const TRANSLATIONS: Record<Language, Record<UIKey, string>> = {
  es: ES,
  en: EN,
  zh: ZH,
};

/** Ordered list for rendering the language selector. */
export const LANGUAGE_OPTIONS: Language[] = ["es", "en", "zh"];

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
