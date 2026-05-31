/** Renders transcript text with the given phrases wrapped in <mark>. */

import { buildHighlightSegments } from "../utils/layers";

interface Props {
  text: string;
  phrases: string[];
  /** CSS class applied to highlighted spans (controls the color). */
  markClassName?: string;
}

export function HighlightedText({ text, phrases, markClassName = "mark-win" }: Props) {
  const segments = buildHighlightSegments(text, phrases);
  return (
    <pre className="transcript">
      {segments.map((seg, i) =>
        seg.highlighted ? (
          <mark key={i} className={markClassName}>
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </pre>
  );
}
