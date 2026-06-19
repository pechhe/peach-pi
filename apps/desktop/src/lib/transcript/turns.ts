import type { TranscriptItem } from "@peach-pi/shared-types";

/** A rewind target: the session-tree entry id of a user turn. */
export interface ForkTurn {
  entryId: string;
  text: string;
}

export interface TurnMap {
  /** lastItemId of a turn → its rewind target (where the button renders). */
  endById: Map<string, { entryId: string; keepCount: number }>;
  /** turn entry id → number of transcript items to keep when rewinding to it. */
  keepByEntry: Map<string, number>;
}

/**
 * Map each `user` transcript item to the matching fork entry id, in order.
 *
 * The renderer's transcript ids are recorder-generated, not session-tree
 * entry ids, so we correlate by position: the kth `user` item corresponds to
 * the kth entry from `getUserMessagesForForking()`. Non-user items (assistant,
 * tool, compaction, branch-summary) interleave freely and are ignored for the
 * correlation — only the ordinal of `user` items matters.
 *
 * `keepCount` for a turn is the index of its user item: rewinding keeps exactly
 * the items before that user message.
 */
export function mapTurns(items: readonly TranscriptItem[], turns: readonly ForkTurn[]): TurnMap {
  const endById = new Map<string, { entryId: string; keepCount: number }>();
  const keepByEntry = new Map<string, number>();
  if (turns.length === 0 || items.length === 0) return { endById, keepByEntry };

  let userIdx = -1;
  let lastId: string | null = null;
  let cur: { entryId: string; keepCount: number } | null = null;
  items.forEach((it, i) => {
    if (it.kind === "user") {
      if (lastId && cur) endById.set(lastId, cur);
      userIdx++;
      const entryId = turns[userIdx]?.entryId;
      cur = entryId ? { entryId, keepCount: i } : null;
      if (entryId) keepByEntry.set(entryId, i);
    }
    lastId = it.id;
  });
  if (lastId && cur) endById.set(lastId, cur);
  return { endById, keepByEntry };
}
