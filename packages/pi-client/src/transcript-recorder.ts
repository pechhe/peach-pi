import type { TranscriptItem, TranscriptOp } from "@peach-pi/shared-types";

/**
 * Maps pi SDK events / messages into transcript ops.
 *
 * Deliberately decoupled from SDK types: it consumes structurally-typed
 * events so it stays unit-testable without the pi package and resilient
 * to SDK minor-version drift.
 */

interface MessageLike {
  role: string;
  content?: unknown;
  stopReason?: string;
  errorMessage?: string;
}

export interface RecorderEvent {
  type: string;
  message?: MessageLike;
  assistantMessageEvent?: { type: string; delta?: string };
  toolCallId?: string;
  toolName?: string;
  args?: unknown;
  result?: unknown;
  isError?: boolean;
}

function blocksToText(content: unknown, type: "text" | "thinking"): string {
  if (typeof content === "string") return type === "text" ? content : "";
  if (!Array.isArray(content)) return "";
  return content
    .filter((b): b is { type: string; text?: string; thinking?: string } => !!b && typeof b === "object")
    .filter((b) => b.type === type)
    .map((b) => (type === "text" ? b.text : b.thinking) ?? "")
    .join("");
}

function blocksToImages(content: unknown): { mimeType: string; data: string }[] {
  if (!Array.isArray(content)) return [];
  return content
    .filter(
      (b): b is { type: string; data?: string; mimeType?: string } =>
        !!b && typeof b === "object",
    )
    .filter((b) => b.type === "image" && typeof b.data === "string" && typeof b.mimeType === "string")
    .map((b) => ({ mimeType: b.mimeType!, data: b.data! }));
}

function summarizeArgs(args: unknown): string {
  try {
    const s = JSON.stringify(args);
    return s.length > 200 ? `${s.slice(0, 200)}…` : (s ?? "");
  } catch {
    return "";
  }
}

function resultToText(result: unknown): string {
  if (typeof result === "string") return result;
  if (result && typeof result === "object" && "content" in result) {
    return blocksToText((result as { content: unknown }).content, "text");
  }
  return "";
}

export class TranscriptRecorder {
  private items: TranscriptItem[] = [];
  private seq = 0;
  private activeAssistantId: string | null = null;

  transcript(): TranscriptItem[] {
    return this.items;
  }

  /** Rebuild from persisted message history (session resume). */
  load(messages: MessageLike[]): TranscriptOp[] {
    this.items = [];
    this.seq = 0;
    this.activeAssistantId = null;
    for (const m of messages) this.upsert(this.messageToItem(m, false));
    return [{ op: "reset", items: this.items }];
  }

  handleEvent(event: RecorderEvent): TranscriptOp[] {
    switch (event.type) {
      case "message_start": {
        if (!event.message) return [];
        const item = this.messageToItem(event.message, true);
        if (item.kind === "assistant") this.activeAssistantId = item.id;
        return [this.upsertOp(item)];
      }
      case "message_update": {
        const e = event.assistantMessageEvent;
        const id = this.activeAssistantId;
        if (!e || !id || typeof e.delta !== "string") return [];
        if (e.type === "text_delta") return [this.appendOp(id, "text", e.delta)];
        if (e.type === "thinking_delta") return [this.appendOp(id, "thinking", e.delta)];
        return [];
      }
      case "message_end": {
        if (!event.message) return [];
        const role = event.message.role;
        if (role !== "assistant") return [];
        const id = this.activeAssistantId ?? this.nextId("a");
        this.activeAssistantId = null;
        const stopReason = event.message.stopReason;
        const item: TranscriptItem = {
          id,
          kind: "assistant",
          text: blocksToText(event.message.content, "text"),
          thinking: blocksToText(event.message.content, "thinking"),
          streaming: false,
          ...(stopReason === "error" || stopReason === "aborted"
            ? { error: event.message.errorMessage ?? stopReason }
            : {}),
        };
        return [this.upsertOp(item)];
      }
      case "tool_execution_start": {
        if (!event.toolCallId) return [];
        return [
          this.upsertOp({
            id: event.toolCallId,
            kind: "tool",
            toolName: event.toolName ?? "tool",
            argsSummary: summarizeArgs(event.args),
            output: "",
            status: "running",
          }),
        ];
      }
      case "tool_execution_end": {
        if (!event.toolCallId) return [];
        const existing = this.items.find((i) => i.id === event.toolCallId);
        return [
          this.upsertOp({
            id: event.toolCallId,
            kind: "tool",
            toolName: event.toolName ?? "tool",
            argsSummary: existing?.kind === "tool" ? existing.argsSummary : "",
            output: resultToText(event.result),
            status: event.isError ? "error" : "done",
          }),
        ];
      }
      default:
        return [];
    }
  }

  private messageToItem(m: MessageLike, streaming: boolean): TranscriptItem {
    const id = this.nextId(m.role === "user" ? "u" : m.role === "assistant" ? "a" : "n");
    if (m.role === "user") {
      const images = blocksToImages(m.content);
      return {
        id,
        kind: "user",
        text: blocksToText(m.content, "text"),
        ...(images.length ? { images } : {}),
      };
    }
    if (m.role === "assistant") {
      return {
        id,
        kind: "assistant",
        text: blocksToText(m.content, "text"),
        thinking: blocksToText(m.content, "thinking"),
        streaming,
      };
    }
    if (m.role === "toolResult") {
      // Synthesized only during load(); live tool items use toolCallId.
      return {
        id,
        kind: "tool",
        toolName: "tool",
        argsSummary: "",
        output: blocksToText(m.content, "text"),
        status: "done",
      };
    }
    return { id, kind: "notice", text: blocksToText(m.content, "text") };
  }

  private nextId(prefix: string): string {
    return `${prefix}${this.seq++}`;
  }

  private upsertOp(item: TranscriptItem): TranscriptOp {
    this.upsert(item);
    return { op: "upsert", item };
  }

  private appendOp(id: string, field: "text" | "thinking" | "output", delta: string): TranscriptOp {
    const idx = this.items.findIndex((i) => i.id === id);
    if (idx !== -1) {
      const item = this.items[idx] as Record<string, unknown>;
      this.items[idx] = { ...item, [field]: `${item[field] ?? ""}${delta}` } as TranscriptItem;
    }
    return { op: "append", id, field, delta };
  }

  private upsert(item: TranscriptItem): void {
    const idx = this.items.findIndex((i) => i.id === item.id);
    if (idx === -1) this.items.push(item);
    else this.items[idx] = item;
  }
}
