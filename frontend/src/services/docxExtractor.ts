/**
 * Client-side .docx text extraction using mammoth.js.
 *
 * Ingestion is strictly limited to Word .docx documents: we reject by
 * extension AND by MIME type before handing the bytes to mammoth. Legacy
 * binary .doc is intentionally NOT supported (mammoth cannot read it).
 *
 * All error messages are localized through `i18n.tr` using the language the
 * caller passes in.
 */

import mammoth from "mammoth";
import type { Language } from "../types";
import { tr } from "../utils/i18n";

/** Canonical MIME type for .docx (OpenXML word document). */
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Base class for any failure while extracting text from a document. */
export class DocxExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocxExtractionError";
  }
}

/** Raised when the chosen file is not an accepted .docx document. */
export class UnsupportedFileError extends DocxExtractionError {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedFileError";
  }
}

/** Result of extracting text from a document. */
export interface ExtractionResult {
  filename: string;
  /** Clean plain text, ready to POST to the backend. */
  text: string;
  /** Non-fatal mammoth messages (e.g. unsupported styles). */
  warnings: string[];
}

/** True only for genuine .docx files (extension + MIME both checked). */
export function isDocx(file: File): boolean {
  const hasExt = file.name.toLowerCase().endsWith(".docx");
  // Some pickers leave type empty; accept that as long as the extension is ok.
  const mimeOk = file.type === DOCX_MIME || file.type === "";
  return hasExt && mimeOk;
}

/**
 * Extract clean text from a .docx File. Error messages use `language`.
 *
 * @throws UnsupportedFileError if the file is not a .docx or has no text.
 * @throws DocxExtractionError if mammoth fails to read the file.
 */
export async function extractDocxText(
  file: File,
  language: Language,
): Promise<ExtractionResult> {
  if (!isDocx(file)) {
    throw new UnsupportedFileError(
      tr(language, "docx.unsupported", { name: file.name }),
    );
  }

  let value: string;
  let messages: { message: string }[];
  try {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    value = result.value;
    messages = result.messages;
  } catch {
    throw new DocxExtractionError(
      tr(language, "docx.readError", { name: file.name }),
    );
  }

  const text = value.trim();
  if (!text) {
    throw new UnsupportedFileError(
      tr(language, "docx.empty", { name: file.name }),
    );
  }

  return {
    filename: file.name,
    text,
    warnings: messages.map((m) => m.message),
  };
}
