/** Renderer-facing transcript model. Main process maps pi SDK events into
 *  these ops; renderer applies them to a per-thread item list. */

import type { ImagePayload } from "./entities.ts";

export type SubagentStatus =
  | "started"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "batch";

/** One launched agent within a subagent tool call (batch-aware). */
export interface SubagentRow {
  name: string;
  agent?: string;
  title?: string;
  task?: string;
  summary?: string;
  status: SubagentStatus;
  elapsed?: number;
}

export type TranscriptItem =
  | { id: string; kind: "user"; text: string; images?: ImagePayload[] }
  | {
      id: string;
      kind: "assistant";
      text: string;
      thinking: string;
      streaming: boolean;
      error?: string;
    }
  | {
      id: string;
      kind: "tool";
      toolName: string;
      argsSummary: string;
      output: string;
      status: "running" | "done" | "error";
    }
  | {
      id: string;
      kind: "subagent";
      verb: "spawn" | "resume";
      createdAt: string;
      rows: SubagentRow[];
    }
  | { id: string; kind: "notice"; text: string }
  | {
      id: string;
      kind: "compaction";
      running: boolean;
      reason: "manual" | "threshold" | "overflow";
      summary?: string;
      tokensBefore?: number;
      /** Approx tokens the summarised region was compressed *to* (summary size). */
      tokensAfter?: number;
      aborted?: boolean;
      error?: string;
    };

export type TranscriptOp =
  | { op: "reset"; items: TranscriptItem[] }
  | { op: "upsert"; item: TranscriptItem }
  | { op: "append"; id: string; field: "text" | "thinking" | "output"; delta: string };

export interface TranscriptDelta {
  threadId: string;
  ops: TranscriptOp[];
  /** Monotonic flush counter. Lets a renderer that backfills via
   *  `threads:getTranscript` drop deltas already folded into the snapshot. */
  seq: number;
}

/** Full-history backfill: authoritative items plus the flush boundary they
 *  reflect. Deltas with `seq > seq` must be replayed on top of `items`. */
export interface TranscriptSnapshot {
  items: TranscriptItem[];
  seq: number;
}

/** Apply ops to an item list (pure; shared by renderer store and tests). */
export function applyTranscriptOps(
  items: TranscriptItem[],
  ops: TranscriptOp[],
): TranscriptItem[] {
  let next = items;
  for (const op of ops) {
    if (op.op === "reset") {
      next = [...op.items];
    } else if (op.op === "upsert") {
      const idx = next.findIndex((i) => i.id === op.item.id);
      next = idx === -1 ? [...next, op.item] : next.with(idx, op.item);
    } else {
      const idx = next.findIndex((i) => i.id === op.id);
      if (idx === -1) continue;
      const item = next[idx]!;
      if (op.field in item) {
        next = next.with(idx, {
          ...item,
          [op.field]: (item as Record<string, unknown>)[op.field] + op.delta,
        } as TranscriptItem);
      }
    }
  }
  return next;
}
