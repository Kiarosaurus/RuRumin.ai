/**
 * Keyboard navigation over highlighted ideas, shared by the reader views.
 *
 * - Concepts behave as toggles: select one to scope navigation to its ideas,
 *   click again (or select another) to change scope. No selection = navigate
 *   every highlighted idea in the text.
 * - ArrowLeft / ArrowRight move the focused idea (wrapping around). The focused
 *   range drives the highlight focus ring + smooth scroll in HighlightedText.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { navigableIdeas, type ConceptPhrases, type IdeaRange } from "../utils/layers";

export interface IdeaNavigation {
  selectedId: string | null;
  toggleSelect: (id: string) => void;
  ideas: IdeaRange[];
  /** 0-based focused index, or -1 when nothing is focused yet. */
  index: number;
  focusedRange: { start: number; end: number } | null;
}

export function useIdeaNavigation(
  text: string,
  concepts: ConceptPhrases[],
): IdeaNavigation {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [index, setIndex] = useState(-1);

  const ideas = useMemo(
    () => navigableIdeas(text, concepts, selectedId),
    [text, concepts, selectedId],
  );

  // Changing scope (selection) or document resets the focus.
  useEffect(() => {
    setIndex(-1);
  }, [selectedId, text]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (ideas.length === 0) return;
      e.preventDefault();
      setIndex((prev) => {
        if (e.key === "ArrowRight") return prev < 0 ? 0 : (prev + 1) % ideas.length;
        return prev < 0 ? ideas.length - 1 : (prev - 1 + ideas.length) % ideas.length;
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ideas]);

  const toggleSelect = useCallback(
    (id: string) => setSelectedId((prev) => (prev === id ? null : id)),
    [],
  );

  const focusedRange =
    index >= 0 && index < ideas.length
      ? { start: ideas[index].start, end: ideas[index].end }
      : null;

  return { selectedId, toggleSelect, ideas, index, focusedRange };
}
