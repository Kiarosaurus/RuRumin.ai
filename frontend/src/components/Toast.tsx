/** Lightweight toast notification (no external dependency). */

export type ToastKind = "error" | "success" | "info";

export interface ToastState {
  kind: ToastKind;
  message: string;
}

interface Props {
  toast: ToastState | null;
  onClose: () => void;
}

export function Toast({ toast, onClose }: Props) {
  if (!toast) return null;
  return (
    <div className={`toast toast-${toast.kind}`} role="alert">
      <span className="toast-message">{toast.message}</span>
      <button className="toast-close" onClick={onClose} aria-label="Cerrar">
        ×
      </button>
    </div>
  );
}
