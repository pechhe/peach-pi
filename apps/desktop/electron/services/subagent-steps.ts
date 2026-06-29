import { readFileSync } from "node:fs";
import type { SubagentStep, SubagentStepTone } from "@peach-pi/shared-types";

/**
 * Build a journey of `SubagentStep` for a subagent by reading its session
 * `.jsonl` file directly.
 *
 * Why parse here instead of using the SDK's `SessionManager`: the file is the
 * child agent's live session — opening a `SessionManager` on it risks
 * mutating it and its in-memory index. The file is append-only JSONL, so a
 * defensive line-by-line parse survives the partial trailing line the child
 * is mid-write. No SDK runtime import needed.
 *
 * The SDK's own widget (`pi-subagents/src/runtime/widget.ts`) reads the same
 * file the same way, so this stays in lock-step with what the TUI surfaces.
 *
 * Step model:
 * - assistant text blocks → `narration` steps (one per distinct message,
 *   multi-block text joined). These are the milestones; the renderer shows
 *   the last one as the current task.
 * - tool calls → `tool` steps titled `"<Tool>: <argsSummary>"`. A matching
 *   later `toolResult` flips the call's tone from `active`→`done`/`failed`.
 */

type AnyRecord = Record<string, unknown>;

interface ToolCallBlock {
  type: "toolCall";
  id: string;
  name: string;
  arguments?: Record<string, unknown>;
}
interface TextBlock {
  type: "text";
  text: string;
}
/** A content block. Unknown block kinds still carry `type`; we only read the
 *  fields relevant to the known kinds, so a permissive shape avoids fragile
 *  discriminated-union narrowing across the SDK's versioned payloads. */
interface ContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  arguments?: Record<string, unknown>;
}

interface Message {
  role?: string;
  content?: ContentBlock[] | string;
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
  stopReason?: string;
  errorMessage?: string;
  timestamp?: number;
  usage?: { totalTokens?: number };
}
interface SessionEntry {
  type?: string;
  id?: string;
  timestamp?: string;
  message?: Message;
}

const EMPTY: SubagentStep[] = [];

function relAt(t: number): string {
  const rel = Date.now() - t;
  if (rel < 60_000) return "now";
  const mins = Math.floor(rel / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

function clip(s: string, n = 160): string {
  const t = s.trim().replace(/\s+/g, " ");
  return t.length > n ? `${t.slice(0, n)}…` : t;
}

/** Compact a tool's arguments into a one-line summary. Mirrors the
 *  recorder's `summarizeArgs` for the tool families subagents use most. */
function summarizeArgs(toolName: string | undefined, args: unknown): string {
  const obj = args && typeof args === "object" ? (args as AnyRecord) : null;
  if (!obj) return "";
  const pickStr = (...keys: string[]): string | null => {
    for (const k of keys) {
      const v = obj[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return null;
  };
  switch (toolName) {
    case "bash":
    case "shell": {
      const c = pickStr("command", "cmd");
      if (c) return clip(c);
      break;
    }
    case "read":
    case "write":
    case "edit": {
      const p = pickStr("path", "file", "filePath", "target");
      if (p) return clip(p);
      break;
    }
    case "cymbal_show":
    case "cymbal_search":
    case "cymbal_outline":
    case "cymbal_refs":
    case "cymbal_impact":
    case "grep":
    case "find": {
      const q = pickStr("query", "symbol", "text", "pattern");
      if (q) return clip(q);
      break;
    }
    case "web_search":
    case "firecrawl_search": {
      const q = pickStr("query", "q", "search");
      if (q) return clip(q);
      break;
    }
    case "web_fetch":
    case "firecrawl_scrape": {
      const u = pickStr("url");
      if (u) return clip(u);
      break;
    }
  }
  // Generic fallback: first short string field, else compact JSON.
  for (const v of Object.values(obj)) {
    if (typeof v === "string" && v.trim() && v.length <= 160) return clip(v);
  }
  try {
    const s = JSON.stringify(args);
    return s && s.length > 160 ? `${s.slice(0, 160)}…` : (s ?? "");
  } catch {
    return "";
  }
}

function textBlocks(content: ContentBlock[] | string | undefined): TextBlock[] {
  if (typeof content === "string") return content.trim() ? [{ type: "text", text: content }] : [];
  if (!Array.isArray(content)) return [];
  return content
    .filter((b): b is TextBlock => b?.type === "text" && typeof b.text === "string")
    .map((b) => ({ type: "text" as const, text: b.text! }));
}

interface PendingTool {
  id: string;
  name: string;
  entryIndex: number;
}

/** Read a subagent session file and build journey steps.
 *  Returns `[]` if the file is missing or unreadable. Never throws — the
 *  renderer falls back to the live-widget-derived journey on any failure. */
export function readSubagentSteps(sessionFile: string | undefined): SubagentStep[] {
  if (!sessionFile) return EMPTY;
  let raw: string;
  try {
    raw = readFileSync(sessionFile, "utf8");
  } catch {
    return EMPTY;
  }

  const steps: SubagentStep[] = [];
  // toolCall.id → entryIndex in `steps`, so a later toolResult flips its tone.
  const toolByCallId = new Map<string, number>();
  const pending: PendingTool[] = [];

  const lines = raw.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    let entry: SessionEntry;
    try {
      entry = JSON.parse(line) as SessionEntry;
    } catch {
      // Partial trailing line during a live write — stop here.
      break;
    }
    if (entry.type !== "message" || !entry.message) continue;
    const msg = entry.message;
    const ts = entry.timestamp
      ? Date.parse(entry.timestamp) || (typeof msg.timestamp === "number" ? msg.timestamp : Date.now())
      : typeof msg.timestamp === "number"
        ? msg.timestamp
        : Date.now();

    if (msg.role === "assistant") {
      // Narration: join all text blocks into one step.
      const texts = textBlocks(msg.content).map((b) => b.text.trim()).filter(Boolean);
      if (texts.length) {
        steps.push({
          id: `step-${i}-text`,
          tone: "done",
          kind: "narration",
          title: clip(texts.join("\n")),
          fullTitle: texts.join("\n").trim(),
          at: relAt(ts),
        });
      }
      // Launch pending tool calls.
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type !== "toolCall") continue;
          const id = typeof block.id === "string" ? block.id : undefined;
          const name = typeof block.name === "string" ? block.name : undefined;
          if (!id || !name) continue;
          const args = summarizeArgs(name, block.arguments);
          const idx = steps.length;
          steps.push({
            id: `step-${i}-tool-${id}`,
            tone: "active",
            kind: "tool",
            title: args ? `${name}: ${args}` : name,
            at: relAt(ts),
          });
          toolByCallId.set(id, idx);
          pending.push({ id, name, entryIndex: idx });
        }
      }
    } else if (msg.role === "toolResult") {
      const rawId = typeof msg.toolCallId === "string" ? msg.toolCallId : undefined;
      if (!rawId) continue;
      const idx = toolByCallId.get(rawId);
      if (idx === undefined) continue;
      const step = steps[idx]!;
      const failed = msg.isError === true;
      steps[idx] = {
        ...step,
        tone: failed ? ("failed" as SubagentStepTone) : ("done" as SubagentStepTone),
        // Keep the tool-call title; attach a short result as the subtitle.
        subtitle: subtitleForResult(msg.content, failed),
      };
      toolByCallId.delete(rawId);
      const pIdx = pending.findIndex((p) => p.id === rawId);
      if (pIdx >= 0) pending.splice(pIdx, 1);
    }
  }

  // Any tool calls with no matching result are still in flight → keep them
  // marked active (the spinner lives here). Everything else lands as done.
  return steps;
}

function subtitleForResult(content: ContentBlock[] | string | undefined, failed: boolean): string | undefined {
  if (typeof content === "string") return failed ? clip(content) || undefined : clip(content) || undefined;
  if (!Array.isArray(content)) return undefined;
  const texts = textBlocks(content).map((b) => b.text.trim()).filter(Boolean);
  if (!texts.length) return undefined;
  return clip(texts.join("\n"));
}
