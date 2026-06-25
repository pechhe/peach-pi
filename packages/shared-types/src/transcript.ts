/** Renderer-facing transcript model. Main process maps pi SDK events into
 *  these ops; renderer applies them to a per-thread item list. */

import type { ImagePayload } from "./entities.ts";
import type { ThreadId, ThreadStatus } from "./entities.ts";

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
  | { op: "append"; id: string; field: "text" | "thinking" | "output"; delta: string }
  | { op: "delete"; id: string };

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
    } else if (op.op === "delete") {
      next = next.filter((i) => i.id !== op.id);
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

/** A tagged-union frame emitted by `ThreadService.subscribe` (ADR-0009's
 *  "second subscriber" seam). One shape per emission path; new frame types or
 *  new subscribers are added here + at the one emit site, not in 4 hooks.
 *  This is the in-process subscriber seam — `RemoteTapFrame` below is the
 *  SSE wire type the relay builds from these. */
export type ThreadFrame =
  | { kind: "transcript"; threadId: ThreadId; ops: TranscriptOp[]; seq: number }
  | { kind: "status"; threadId: ThreadId; status: ThreadStatus }
  | { kind: "queue"; threadId: ThreadId; steering: string[]; followUp: string[] }
  | { kind: "idle"; threadId: ThreadId; cwd: string | null };

/** Listener registered with `ThreadService.subscribe`; receives every frame. */
export type ThreadFrameListener = (frame: ThreadFrame) => void;

/** One frame on the remote session tap wire (SSE). The laptop folds these into
 *  its existing timeline exactly like the local `event:transcript` stream.
 *  Defined here because it references the transcript item/op shapes. */
export type RemoteTapFrame =
  | { kind: "backfill"; threadId: ThreadId; items: TranscriptItem[]; seq: number }
  | { kind: "transcript"; threadId: ThreadId; ops: TranscriptOp[]; seq: number }
  | { kind: "checkpoint"; threadId: ThreadId; sha: string; at: string }
  // Live run/queue state (ADR-0010), so the phone composer can morph send↔stop
  // and show the queued backlog without polling.
  | { kind: "status"; threadId: ThreadId; status: ThreadStatus }
  | { kind: "queue"; threadId: ThreadId; steering: string[]; followUp: string[] }
  | { kind: "bye"; threadId: ThreadId; reason: string };
