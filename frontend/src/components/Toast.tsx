/** Lightweight toast notification (no external dependency). */

import type { Language } from "../types";
import { tr } from "../utils/i18n";

export type ToastKind = "error" | "success" | "info";

export interface ToastState {
  kind: ToastKind;
  message: string;
}

interface Props {
  toast: ToastState | null;
  language: Language;
  onClose: () => void;
}

export function Toast({ toast, language, onClose }: Props) {
  if (!toast) return null;
  return (
    <div className={`toast toast-${toast.kind}`} role="alert">
      <span className="toast-message">{toast.message}</span>
      <button
        className="toast-close"
        onClick={onClose}
        aria-label={tr(language, "a11y.close")}
      >
        ×
      </button>
    </div>
  );
}
