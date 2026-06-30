import type { TranscriptItem } from "@peach-pi/shared-types";
import { itemText } from "./group-prep-runs";

export const FIND_HL = "thread-find";
export const FIND_HL_CUR = "thread-find-current";

/**
 * In-thread find (⌘F) reactive slice. Holds find-bar open/query/index state,
 * the derived match list, and navigation. DOM effects (scroll-into-view,
 * CSS Custom Highlight painting) live in the Transcript component because
 * they need its scroll element; this slice exposes the values they read.
 */
export class ThreadFind {
  findOpen = $state(false);
  findQuery = $state("");
  findIndex = $state(0);
  /** Bumped when ⌘F is pressed while the bar is already open, so the
   *  Transcript can refocus the FindBar input. */
  focusTick = $state(0);

  private skipNextReset = false;

  matches = $derived.by<string[]>(() => {
    const q = this.findQuery.trim().toLowerCase();
    if (!this.findOpen || !q) return [];
    return this.items().filter((it) => itemText(it).includes(q)).map((it) => it.id);
  });

  currentMatchId = $derived(this.matches[this.findIndex] ?? null);

  constructor(private readonly items: () => readonly TranscriptItem[]) {}

  /** ⌘F: open the bar, or refocus its input if already open. */
  toggleOpenOrFocus(): void {
    if (this.findOpen) this.focusTick++;
    else this.findOpen = true;
  }

  /** ⌘K body-match handoff: open pre-filled and jump to the last match. */
  applyPending(query: string): void {
    this.skipNextReset = true;
    this.findQuery = query;
    this.findOpen = true;
    this.findIndex = Math.max(0, this.matches.length - 1);
  }

  findNext(): void {
    if (this.matches.length === 0) return;
    this.findIndex = (this.findIndex + 1) % this.matches.length;
  }

  findPrev(): void {
    if (this.matches.length === 0) return;
    this.findIndex = (this.findIndex - 1 + this.matches.length) % this.matches.length;
  }

  close(): void {
    this.findOpen = false;
    this.findQuery = "";
    // The CSS-Highlight effect (in Transcript) re-runs on findOpen=false and
    // clears the painted ranges itself.
  }

  /** Reset to the first match whenever the query changes, UNLESS a pending
   *  find from ⌘K is in flight (it set findIndex itself). Called by the
   *  component's query-change effect. */
  onQueryChanged(): void {
    void this.findQuery;
    if (this.skipNextReset) {
      this.skipNextReset = false;
    } else {
      this.findIndex = 0;
    }
  }
}

export function clearFindHighlights(): void {
  const reg = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
  reg?.delete(FIND_HL);
  reg?.delete(FIND_HL_CUR);
}

export function addRanges(root: Element, needle: string, hl: { add: (r: Range) => void }): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const text = node.nodeValue?.toLowerCase();
    if (!text) continue;
    let from = 0;
    let idx = text.indexOf(needle, from);
    while (idx !== -1) {
      const range = new Range();
      range.setStart(node, idx);
      range.setEnd(node, idx + needle.length);
      hl.add(range);
      from = idx + needle.length;
      idx = text.indexOf(needle, from);
    }
  }
}
