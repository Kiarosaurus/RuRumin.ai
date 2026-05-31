/** Small inline spinner + optional full-panel loading overlay. */

interface SpinnerProps {
  /** Diameter in px. */
  size?: number;
}

export function Spinner({ size = 18 }: SpinnerProps) {
  return (
    <span
      className="spinner"
      style={{ width: size, height: size, borderWidth: Math.max(2, size / 9) }}
      role="status"
      aria-label="Cargando"
    />
  );
}

interface OverlayProps {
  message?: string;
}

/** Full-area blocking overlay shown while the backend analyzes the text. */
export function LoadingOverlay({ message = "Analizando…" }: OverlayProps) {
  return (
    <div className="loading-overlay" role="alert" aria-busy="true">
      <Spinner size={40} />
      <p>{message}</p>
    </div>
  );
}
