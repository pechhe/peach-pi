import type {
  SubagentRow,
  SubagentStatus,
  TranscriptItem,
  TranscriptOp,
} from "@peach-pi/shared-types";

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
  display?: boolean;
}

/** Structural subset of pi's `SessionEntry` read by `loadFromEntries`. The
 *  recorder stays decoupled from the SDK (unit-testable without it), so this
 *  mirrors only the fields the GUI transcript needs. */
export interface BranchEntryLike {
  id: string;
  type: string;
  message?: MessageLike;
  content?: unknown;
  display?: boolean;
  summary?: string;
  tokensBefore?: number;
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
  // Compaction events (mirrors of the SDK union, kept structural so the
  // recorder stays unit-testable without importing the pi package).
  reason?: "manual" | "threshold" | "overflow";
  aborted?: boolean;
  errorMessage?: string;
  // Auto-retry events (mirror of the SDK `auto_retry_start` / `auto_retry_end`
  // events, kept structural). Emitted by the SDK on connection failures when
  // auto-retry is enabled (~/.pi/agent/settings.json `retry`).
  attempt?: number;
  maxAttempts?: number;
  delayMs?: number;
  success?: boolean;
  finalError?: string;
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

function summarizeArgs(toolName: string | undefined, args: unknown): string {
  const obj = args && typeof args === "object" ? (args as Record<string, unknown>) : null;
  const pickStr = (...keys: string[]): string | null => {
    if (!obj) return null;
    for (const k of keys) {
      const v = obj[k];
      if (typeof v === "string" && v.trim()) return v;
    }
    return null;
  };
  const clip = (s: string, n = 120): string => (s.length > n ? `${s.slice(0, n)}…` : s);

  switch (toolName) {
    case "bash":
    case "shell": {
      const c = pickStr("command", "cmd");
      if (c) return clip(c.replace(/\s+/g, " ").trim());
      break;
    }
    case "read":
    case "write":
    case "edit": {
      const p = pickStr("path", "file", "filePath", "target");
      if (p) return clip(p);
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
    case "subagent":
    case "subagent_resume": {
      const n = pickStr("name", "agent");
      if (n) return clip(n);
      break;
    }
  }

  // Generic fallback: show the first short string field, else compact JSON.
  if (obj) {
    for (const v of Object.values(obj)) {
      if (typeof v === "string" && v.trim() && v.length <= 120) return v.trim();
    }
  }
  try {
    const s = JSON.stringify(args);
    return s && s.length > 120 ? `${s.slice(0, 120)}…` : (s ?? "");
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

/** Read a compaction_end `result` ({ summary?, tokensBefore? }) structurally. */
function compactionResult(result: unknown): { summary?: string; tokensBefore?: number } {
  const obj = asObject(result);
  if (!obj) return {};
  const out: { summary?: string; tokensBefore?: number } = {};
  if (typeof obj.summary === "string") out.summary = obj.summary;
  if (typeof obj.tokensBefore === "number") out.tokensBefore = obj.tokensBefore;
  return out;
}

// ── Subagent tool calls ───────────────────────────────────────────────────
// `subagent` / `subagent_resume` calls render as a dedicated card. We extract
// the structured launch input and the result `details` (status, elapsed,
// summary, per-child rows) the generic tool path would otherwise drop.

function isSubagentTool(toolName: string | undefined): boolean {
  return toolName === "subagent" || toolName === "subagent_resume";
}

interface SubagentChildInput {
  name?: string;
  agent?: string;
  title?: string;
  task?: string;
}
interface SubagentInput extends SubagentChildInput {
  children?: SubagentChildInput[];
}
interface SubagentDetails {
  status?: string;
  name?: string;
  agent?: string;
  title?: string;
  task?: string;
  summary?: string;
  elapsed?: number;
  exitCode?: number;
  errorMessage?: string;
  children?: SubagentDetails[];
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function resultDetails(result: unknown): SubagentDetails | undefined {
  const obj = asObject(result);
  return obj ? asObject(obj.details) : undefined;
}

function normaliseStatus(
  raw: string | undefined,
  exitCode: number | undefined,
  errorMessage: string | undefined,
): SubagentStatus {
  if (
    raw === "started" ||
    raw === "batch" ||
    raw === "completed" ||
    raw === "failed" ||
    raw === "cancelled" ||
    raw === "running"
  ) {
    return raw;
  }
  if (errorMessage) return "failed";
  if (typeof exitCode === "number") return exitCode === 0 ? "completed" : "failed";
  return "running";
}

function rowFrom(
  details: SubagentDetails | undefined,
  fallback: SubagentChildInput | undefined,
): SubagentRow {
  return {
    name: details?.name ?? fallback?.name ?? "subagent",
    agent: details?.agent ?? fallback?.agent,
    title: details?.title ?? fallback?.title,
    task: details?.task ?? fallback?.task,
    summary: details?.summary ?? details?.errorMessage,
    status: normaliseStatus(details?.status, details?.exitCode, details?.errorMessage),
    elapsed: details?.elapsed,
  };
}

/** One row per agent launched by a tool call (batch-aware). `running` true
 *  while the call is in flight and no result details have arrived yet. */
function subagentRows(args: unknown, result: unknown, running: boolean): SubagentRow[] {
  const input = (asObject(args) ?? {}) as SubagentInput;
  const details = resultDetails(result);

  if (details?.children?.length) {
    const childInputs = Array.isArray(input.children) ? input.children : [];
    return details.children.map((child, i) => rowFrom(child, childInputs[i]));
  }
  if (Array.isArray(input.children) && input.children.length) {
    return input.children.map((child) => rowFrom(undefined, child));
  }
  const row = rowFrom(details, input);
  if (!details && running) return [{ ...row, status: "running" }];
  return [row];
}

export class TranscriptRecorder {
  private items: TranscriptItem[] = [];
  private seq = 0;
  private activeAssistantId: string | null = null;
  /** FIFO of in-flight compaction card ids. Multiple compactions can overlap
   *  (app auto-compact, extension smart-compact, SDK builtin); a queue keeps
   *  every start→end pair closing the correct card so none orphan-spins. */
  private activeCompactionIds: string[] = [];
  /** Id of the in-stream auto-retry card (if any). A connection failure with
   *  auto-retry enabled emits `auto_retry_start` → this card spins + shows
   *  attempt N/max. `auto_retry_end` clears or finalises it. One card per
   *  retry sequence — subsequent attempts update the same card in place. */
  private retryId: string | null = null;

  transcript(): TranscriptItem[] {
    return this.items;
  }

  /** Seed optimistic send-time placeholders (pending user message +
   *  vision-proxy card) so the renderer shows them instantly while
   *  `before_agent_start` blocks on the vision round-trip. Dropped when
   *  the real user `message_start` arrives (see message_start handler).
   *  Returns the ops so main can flush them via onOps like every other op. */
  seedPendingUser(text: string, images?: { mimeType: string; data: string }[]): TranscriptOp[] {
    // The optimistic placeholder exists only to cover the vision-proxy
    // `before_agent_start` hook, which blocks on a vision-model round-trip
    // for image-bearing prompts and delays the real user `message_start`.
    // Text-only prompts echo promptly, so a placeholder would just risk a
    // stale duplicate if the echoed text differs from the sent text. Gate on
    // images so text-only sends never seed one.
    if (!images?.length) return [];
    const ts = Date.now();
    return [
      this.upsertOp({
        id: `vp-pending-user-${ts}`,
        kind: "user",
        text,
        images,
      }),
      this.upsertOp({
        id: `vp-card-${ts}`,
        kind: "notice",
        text: "Analyzing image with vision proxy…",
      }),
    ];
  }

  /** Rebuild from persisted message history (session resume). */
  load(messages: MessageLike[]): TranscriptOp[] {
    this.items = [];
    this.seq = 0;
    this.activeAssistantId = null;
    this.activeCompactionIds = [];
    this.retryId = null;
    for (const m of messages) this.upsert(this.messageToItem(m, false));
    return [{ op: "reset", items: this.items }];
  }

  /** Rebuild from the full active branch (root→leaf) of pi session entries.
   *  Unlike `load(messages)`, this does NOT fence at compaction boundaries:
   *  compaction entries render as divider cards in-stream and every message on
   *  the branch stays scrollable. This is the GUI transcript's source of truth
   *  (the SDK's trimmed `session.messages` is only the LLM context). */
  loadFromEntries(entries: BranchEntryLike[]): TranscriptOp[] {
    this.items = [];
    this.seq = 0;
    this.activeAssistantId = null;
    this.activeCompactionIds = [];
    this.retryId = null;
    for (const entry of entries) {
      const item = this.entryToItem(entry);
      if (item) this.upsert(item);
    }
    return [{ op: "reset", items: this.items }];
  }

  private entryToItem(entry: BranchEntryLike): TranscriptItem | undefined {
    switch (entry.type) {
      case "message":
        return this.messageToItem(entry.message ?? { role: "unknown" }, false);
      case "custom_message":
        // Injected context (extensions/asides). `display: false` is hidden in
        // the TUI too; render the rest as a notice, not a real user turn.
        if (entry.display === false) return undefined;
        return this.messageToItem({ role: "custom", content: entry.content }, false);
      case "branch_summary":
        return { id: this.nextId("n"), kind: "notice", text: entry.summary ?? "" };
      case "compaction":
        // Keyed by the persisted entry id so it's stable across reloads and so
        // the live `compaction_end` handler can patch the just-completed one.
        // Persisted entries don't store the trigger reason; default to
        // "threshold" (the common auto-compaction case).
        return {
          id: entry.id,
          kind: "compaction",
          running: false,
          reason: "threshold",
          summary: entry.summary,
          tokensBefore: entry.tokensBefore,
          tokensAfter: entry.summary ? Math.ceil(entry.summary.length / 4) : undefined,
        };
      // thinking_level_change / model_change / custom / label / session_info:
      // not transcript rows (buildSessionContext never emitted them either).
      default:
        return undefined;
    }
  }

  handleEvent(event: RecorderEvent): TranscriptOp[] {
    switch (event.type) {
      case "message_start": {
        if (!event.message) return [];
        // Extensions inject context (e.g. pi-subagents' agent roster) as
        // custom-role messages with `display: false`. The TUI hides these and
        // the reload path (entryToItem → custom_message) skips them; mirror
        // that here so they don't surface as notices on the live path.
        if (event.message.role === "custom" && event.message.display === false) return [];
        const item = this.messageToItem(event.message, true);
        const ops: TranscriptOp[] = [];
        // The real user `message_start` fires after `before_agent_start`.
        // Replace our optimistic pending-user/item and the vision-proxy card.
        // Drop by sentinel id, not text: pi-vision-proxy rewrites image-bearing
        // user content (its whole purpose), so the echoed text commonly differs
        // from the sent text and a text-match would leave a stale duplicate.
        // Prompts serialise (isStreaming queues followUp), so at most one
        // placeholder is outstanding when a user message_start arrives.
        if (item.kind === "user") ops.push(...this.dropPendingPlaceholders());
        if (item.kind === "assistant") this.activeAssistantId = item.id;
        ops.push(this.upsertOp(item));
        return ops;
      }
      case "message_update": {
        const id = this.activeAssistantId;
        if (!id) return [];
        // Prefer the authoritative accumulated message over raw deltas. On a
        // provider stream retry the SDK resets `partial` and re-streams the
        // same content from scratch, so blindly appending `delta` duplicates
        // text. Reconcile against the full message content: append only the
        // new suffix, or replace wholesale when it diverges (the retry case).
        if (event.message?.role === "assistant") return this.reconcileAssistant(id, event.message);
        const e = event.assistantMessageEvent;
        if (!e || typeof e.delta !== "string") return [];
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
        if (isSubagentTool(event.toolName)) {
          return [
            this.upsertOp({
              id: event.toolCallId,
              kind: "subagent",
              verb: event.toolName === "subagent_resume" ? "resume" : "spawn",
              createdAt: new Date().toISOString(),
              rows: subagentRows(event.args, undefined, true),
            }),
          ];
        }
        return [
          this.upsertOp({
            id: event.toolCallId,
            kind: "tool",
            toolName: event.toolName ?? "tool",
            argsSummary: summarizeArgs(event.toolName, event.args),
            output: "",
            status: "running",
          }),
        ];
      }
      case "tool_execution_end": {
        if (!event.toolCallId) return [];
        const existing = this.items.find((i) => i.id === event.toolCallId);
        if (isSubagentTool(event.toolName)) {
          return [
            this.upsertOp({
              id: event.toolCallId,
              kind: "subagent",
              verb: event.toolName === "subagent_resume" ? "resume" : "spawn",
              createdAt:
                existing?.kind === "subagent"
                  ? existing.createdAt
                  : new Date().toISOString(),
              rows: subagentRows(event.args, event.result, false),
            }),
          ];
        }
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
      case "compaction_start": {
        // Finalise any orphaned still-running cards from prior overlapping
        // compactions so none spins forever, then open a new transient card.
        const ops: TranscriptOp[] = [];
        while (this.activeCompactionIds.length > 0) {
          const orphan = this.activeCompactionIds.shift()!;
          ops.push(
            this.upsertOp({
              id: orphan,
              kind: "compaction",
              running: false,
              reason: event.reason ?? "threshold",
              aborted: true,
              error: "Superseded by a newer compaction",
            }),
          );
        }
        const id = `compaction-${Date.now()}`;
        this.activeCompactionIds.push(id);
        ops.push(
          this.upsertOp({
            id,
            kind: "compaction",
            running: true,
            reason: event.reason ?? "threshold",
          }),
        );
        return ops;
      }
      case "compaction_end": {
        // Pop the matching start id (the transient "compacting…" card). A
        // success leaves a persisted entry on the branch; the caller reloads
        // from the branch (which wipes this transient card) and we then patch
        // the just-completed leaf card with the precise reason/summary. On
        // failure nothing is persisted, so we finalise the transient card
        // in place — no caller reload on the failure path.
        const reason = event.reason ?? "threshold";
        const id = this.activeCompactionIds.shift() ?? `compaction-${Date.now()}`;
        if (event.aborted || event.errorMessage) {
          return [
            this.upsertOp({
              id,
              kind: "compaction",
              running: false,
              reason,
              aborted: event.aborted,
              error: event.errorMessage,
            }),
          ];
        }
        const res = compactionResult(event.result);
        const items = this.transcript();
        const last = items[items.length - 1];
        if (last?.kind === "compaction") {
          const tokensAfter = res.summary ? Math.ceil(res.summary.length / 4) : last.tokensAfter;
          return [
            this.upsertOp({
              ...last,
              reason,
              summary: res.summary ?? last.summary,
              tokensBefore: res.tokensBefore ?? last.tokensBefore,
              tokensAfter,
            }),
          ];
        }
        return [];
      }
      case "auto_retry_start": {
        // Open or update an in-stream retry card. The SDK emits one
        // `auto_retry_start` per attempt (attempt increments 1..maxAttempts),
        // so reuse the same card id across the whole retry sequence: each
        // upsert overwrites the previous card in place, giving the grouped
        // "Connection failed N/M" count the user asked for.
        const id = this.retryId ?? `retry-${Date.now()}`;
        this.retryId = id;
        const attempt = event.attempt ?? 1;
        const maxAttempts = event.maxAttempts ?? attempt;
        // The SDK emits message_end (error) BEFORE auto_retry_start, so the
        // failed assistant item already landed with its own error card.
        // The SDK also drops the failed message from agent state on retry,
        // and the retry card replaces it — mirror that here: drop the failed
        // assistant item so only the grouped retry card shows. Without this,
        // every attempt stacks a redundant "Connection error." card under the
        // retry summary.
        const ops: TranscriptOp[] = [];
        const last = this.items[this.items.length - 1];
        if (last?.kind === "assistant" && last.error && !last.text && !last.thinking) {
          ops.push(this.deleteOp(last.id));
        }
        ops.push(
          this.upsertOp({
            id,
            kind: "retry",
            running: true,
            attempt,
            maxAttempts,
            error: event.errorMessage ?? "Connection failed",
          }),
        );
        return ops;
      }
      case "auto_retry_end": {
        // Success → drop the card (the run continues normally and the next
        // assistant message_end replaces the failed one). Failure → finalise
        // the card with the finalError; the thread's `failed` status comes
        // from the existing runOutcome path, so the card just needs to stop
        // spinning.
        const id = this.retryId;
        this.retryId = null;
        if (!id) return [];
        if (event.success) return [this.deleteOp(id)];
        const existing = this.items.find((i) => i.id === id);
        const attempt =
          event.attempt ??
          (existing?.kind === "retry" ? existing.attempt : 1);
        const maxAttempts =
          existing?.kind === "retry" ? existing.maxAttempts : attempt;
        return [
          this.upsertOp({
            id,
            kind: "retry",
            running: false,
            attempt,
            maxAttempts,
            error: event.finalError ?? "Connection failed",
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

  /** Reconcile the active assistant item against the authoritative message. */
  private reconcileAssistant(id: string, m: MessageLike): TranscriptOp[] {
    const idx = this.items.findIndex((i) => i.id === id);
    const prev = idx === -1 ? undefined : this.items[idx];
    if (!prev || prev.kind !== "assistant") return [];
    const text = blocksToText(m.content, "text");
    const thinking = blocksToText(m.content, "thinking");
    // Fast path: both fields only grew — emit minimal append deltas.
    if (text.startsWith(prev.text) && thinking.startsWith(prev.thinking)) {
      const ops: TranscriptOp[] = [];
      if (text.length > prev.text.length) ops.push(this.appendOp(id, "text", text.slice(prev.text.length)));
      if (thinking.length > prev.thinking.length)
        ops.push(this.appendOp(id, "thinking", thinking.slice(prev.thinking.length)));
      return ops;
    }
    // Divergence (stream restart re-emitted content): replace wholesale.
    return [this.upsertOp({ ...prev, text, thinking, streaming: true })];
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

  private deleteOp(id: string): TranscriptOp {
    this.items = this.items.filter((i) => i.id !== id);
    return { op: "delete", id };
  }

  /** Drop the optimistic send-time placeholders (pending user message +
   *  vision-proxy card) once the real user `message_start` arrives — the
   *  `before_agent_start` hook (pi-vision-proxy's blocking vision round-trip)
   *  has returned by this point. No-op when no placeholders exist, so this
   *  is safe for every prompt, image-less or proxy-disabled. */
  private dropPendingPlaceholders(): TranscriptOp[] {
    const ops: TranscriptOp[] = [];
    for (const it of this.items) {
      if (it.id.startsWith("vp-pending-user-") || it.id.startsWith("vp-card-")) {
        ops.push(this.deleteOp(it.id));
      }
    }
    return ops;
  }
}
