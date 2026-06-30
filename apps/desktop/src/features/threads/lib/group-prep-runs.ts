import type { TranscriptItem } from "@peach-pi/shared-types";

export type ToolItem = Extract<TranscriptItem, { kind: "tool" }>;

export type Row =
  | { type: "item"; item: TranscriptItem }
  | { type: "group"; id: string; items: TranscriptItem[]; hasThinking: boolean };

/** Compact token count for the compaction card: 1234 → "1k", 950 → "950". */
export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return `${n}`;
}

/** USD cost with precision scaled to magnitude (sub-cent turns are common). */
export function fmtCost(usd: number): string {
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  if (usd >= 0.01) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(4)}`;
}

/** Text of a transcript item, flattened across its searchable fields. */
export function itemText(it: unknown): string {
  const i = it as Record<string, unknown>;
  return [i.text, i.thinking, i.output, i.summary, i.argsSummary]
    .filter((v): v is string => typeof v === "string")
    .join(" ")
    .toLowerCase();
}

const STEER_RE = /^Sub-agent ".+?" completed/;

// pi-subagents injects a completion steer message into the parent conversation
// when a child finishes. These contain session paths and resume commands that
// are noise in the GUI — the SubagentCard already shows the result in its
// journey timeline. Detect and suppress them.
export function isSteerMessage(item: { kind: string; text?: string }): boolean {
  // Steer/result messages arrive as role=system, recorded as kind "notice",
  // not "assistant". Match by text pattern regardless of kind.
  return typeof item.text === "string" && STEER_RE.test(item.text);
}

/** Summary for a folded prep run. Thinking present → "Reasoning"; tools
 *  only → tool-name breakdown like the old tool group. */
export function groupSummary(items: readonly TranscriptItem[]): string {
  const tools = items.filter((it): it is ToolItem => it.kind === "tool");
  const hasThinking = items.some((it) => it.kind === "assistant");
  if (hasThinking) return tools.length ? `Reasoning · ${tools.length} tool calls` : "Reasoning";
  if (tools.length === 1) return tools[0]!.toolName || tools[0]!.argsSummary || "tool";
  return toolBreakdown(tools);
}

// "bash ×4 · read ×2" — ordered by first appearance.
export function toolBreakdown(group: ToolItem[]): string {
  const counts = new Map<string, number>();
  for (const it of group) {
    const name = it.toolName || it.argsSummary || "tool";
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts].map(([n, c]) => (c > 1 ? `${n} ×${c}` : n)).join(" · ");
}

/** Collapse runs of successful ("done") tool calls AND thinking-only assistant
 *  items into one foldable reasoning card. Anything with real answer content
 *  (assistant-with-text, user, subagent, compaction, retry, notice, steer,
 *  running/error tools) flushes the run and stands alone. */
export function groupPrepRuns(all: readonly TranscriptItem[]): Row[] {
  const out: Row[] = [];
  let group: TranscriptItem[] = [];
  const flush = () => {
    if (group.length === 0) return;
    if (group.length === 1) {
      // A lone foldable item keeps its existing standalone render.
      out.push({ type: "item", item: group[0]! });
    } else {
      out.push({
        type: "group",
        id: `group-${group[0]!.id}`,
        items: group,
        hasThinking: group.some((it) => it.kind === "assistant"),
      });
    }
    group = [];
  };
  for (const it of all) {
    const foldable =
      (it.kind === "tool" && it.status === "done") ||
      (it.kind === "assistant" && !it.text.trim() && !it.error && !!it.thinking);
    if (foldable) group.push(it);
    else { flush(); out.push({ type: "item", item: it }); }
  }
  flush();
  return out;
}
