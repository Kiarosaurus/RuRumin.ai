/**
 * Local persistence for the document repository (IndexedDB).
 *
 * Documents + their analysis trees are large JSON blobs — well past the ~5MB
 * localStorage ceiling — so we persist them in IndexedDB via `idb-keyval`. The
 * whole document list is stored under a single key and rewritten on every
 * change; the dataset is small enough (tens of documents) that a full rewrite
 * is simpler and fast enough, and it keeps the React state the single source of
 * truth (IndexedDB is just a mirror).
 *
 * All operations are best-effort: a storage failure (private mode, quota,
 * disabled IndexedDB) must never crash the app — it only loses persistence for
 * that session, which the caller surfaces as a non-fatal warning.
 */

import { get, set } from "idb-keyval";
import type { DocumentRecord } from "../data/mockData";

/** Single key holding the entire document list. */
const DOCUMENTS_KEY = "rurumin:documents";

/**
 * Load the persisted document list, or `undefined` when nothing was stored yet
 * (first run) or when IndexedDB is unavailable. `undefined` lets the caller
 * distinguish "no saved data, seed the mocks" from "saved empty list".
 */
export async function loadDocuments(): Promise<DocumentRecord[] | undefined> {
  try {
    return await get<DocumentRecord[]>(DOCUMENTS_KEY);
  } catch (err) {
    console.warn("No se pudo leer el repositorio desde IndexedDB:", err);
    return undefined;
  }
}

/** Persist the full document list. Best-effort; swallows storage errors. */
export async function saveDocuments(documents: DocumentRecord[]): Promise<void> {
  try {
    await set(DOCUMENTS_KEY, documents);
  } catch (err) {
    console.warn("No se pudo guardar el repositorio en IndexedDB:", err);
  }
}
