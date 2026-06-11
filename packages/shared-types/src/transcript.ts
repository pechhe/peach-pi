/** Renderer-facing transcript model. Main process maps pi SDK events into
 *  these ops; renderer applies them to a per-thread item list. */

export type TranscriptItem =
  | { id: string; kind: "user"; text: string }
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
  | { id: string; kind: "notice"; text: string };

export type TranscriptOp =
  | { op: "reset"; items: TranscriptItem[] }
  | { op: "upsert"; item: TranscriptItem }
  | { op: "append"; id: string; field: "text" | "thinking" | "output"; delta: string };

export interface TranscriptDelta {
  threadId: string;
  ops: TranscriptOp[];
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
