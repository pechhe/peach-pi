/** Renderer-facing transcript model. Main process maps pi SDK events into
 *  these ops; renderer applies them to a per-thread item list. */

import type { ImagePayload } from "./entities.ts";
import type { RemoteSessionInfo, ThreadId, ThreadStatus } from "./entities.ts";

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
  /** Path to the child agent's `.jsonl` session file, when the
   *  pi-subagents extension exposes it in the tool result `details`. The
   *  renderer polls it to build a rich step-by-step journey (real tool
   *  names + args + narration) instead of the single live-widget line. */
  sessionFile?: string;
}

/** Tone of a journey step rendered in the subagent card. Mirrors the
 *  renderer-local `NodeTone` from journey.svelte.ts so session-file-derived
 *  steps can reuse the same node markup. */
export type SubagentStepTone =
  | "done"
  | "active"
  | "blocked"
  | "failed"
  | "cancelled"
  | "pending";

/** Whether a step is agent narration or a tool call — lets the renderer pick
 *  the last narration as the current task line. */
export type SubagentStepKind = "narration" | "tool";

/** One step in a subagent's journey, derived from its session `.jsonl`.
 *  Structurally compatible with the renderer's `TimelineNode` so the expanded
 *  journey reuses existing node markup. */
export interface SubagentStep {
  id: string;
  tone: SubagentStepTone;
  kind: SubagentStepKind;
  title: string;
  fullTitle?: string;
  subtitle?: string;
  /** Relative time label, e.g. "3m". */
  at: string;
}

/** Token usage + speed for one assistant turn. Tokens/cost come from the
 *  provider (persisted in the session file); ttft/tokensPerSec are runtime
 *  timings measured by the recorder and are absent on reloaded threads. */
export interface AssistantUsage {
  /** Fresh (uncached) input tokens, summed across the turn's calls. Billed at
   *  the model's full input rate. */
  input: number;
  /** Cached input tokens read, summed. Billed at a steep discount (~10% of the
   *  input rate), so a high share here is what makes a turn cheap. */
  cacheRead: number;
  /** Input tokens written to cache, summed. A one-time premium (~125% of the
   *  input rate) that becomes cheap cacheRead on later turns. */
  cacheWrite: number;
  /** Output tokens generated across the whole turn (summed). Highest unit price. */
  output: number;
  /** Total cost in USD, when the model's pricing is known (0 → omitted). */
  costUsd?: number;
  /** Time to first token, in milliseconds (runtime only). */
  ttftMs?: number;
  /** Output tokens per second over the generation phase (runtime only). */
  tokensPerSec?: number;
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
      usage?: AssistantUsage;
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
      kind: "retry";
      running: boolean;
      /** 1-indexed attempt number (attempts 1..maxAttempts). */
      attempt: number;
      /** Max retries the SDK auto-retry will make before giving up. */
      maxAttempts: number;
      /** Provider/runtime error that triggered this retry attempt. */
      error: string;
    }
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

/** One frame on the roster tap wire (SSE). A full snapshot of every served
 *  thread, pushed whenever the roster changes shape (status flip, checkpoint,
 *  create/archive/snooze/mark-to-test, lease handoff). The phone's sessions
 *  list folds by replacing its cached list wholesale — small payload, no
 *  delta/reconciliation cost. Separate from `RemoteTapFrame` (per-thread)
 *  so each router stays a clean tagged union. */
export type RosterFrame = {
  kind: "roster";
  sessions: RemoteSessionInfo[];
};
