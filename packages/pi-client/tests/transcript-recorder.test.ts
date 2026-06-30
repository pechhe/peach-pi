import { test } from "node:test";
import assert from "node:assert/strict";
import { applyTranscriptOps, type TranscriptItem } from "@peach-pi/shared-types";
import { TranscriptRecorder } from "../src/transcript-recorder.ts";

function run(recorder: TranscriptRecorder, events: Parameters<TranscriptRecorder["handleEvent"]>[0][]) {
  let view: TranscriptItem[] = [];
  for (const e of events) view = applyTranscriptOps(view, recorder.handleEvent(e));
  return view;
}

test("user prompt + streamed assistant text", () => {
  const r = new TranscriptRecorder();
  const view = run(r, [
    { type: "agent_start" },
    { type: "message_start", message: { role: "user", content: [{ type: "text", text: "hi" }] } },
    { type: "message_start", message: { role: "assistant", content: [] } },
    { type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "Hel" } },
    { type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "lo" } },
    {
      type: "message_end",
      message: { role: "assistant", content: [{ type: "text", text: "Hello" }], stopReason: "stop" },
    },
  ]);
  assert.equal(view.length, 2);
  assert.deepEqual(view[0], { id: "u0", kind: "user", text: "hi" });
  const a = view[1]!;
  assert.equal(a.kind, "assistant");
  assert.equal((a as { text: string }).text, "Hello");
  assert.equal((a as { streaming: boolean }).streaming, false);
  // recorder internal state matches the applied view
  assert.deepEqual(r.transcript(), view);
});

test("authoritative message content prevents duplication on stream restart", () => {
  // Real SDK puts the full accumulated message on every message_update. On a
  // provider retry the partial resets and re-streams the same text from
  // scratch; appending raw deltas would duplicate it. The recorder must track
  // the authoritative `message` content instead.
  const r = new TranscriptRecorder();
  const view = run(r, [
    { type: "message_start", message: { role: "assistant", content: [] } },
    {
      type: "message_update",
      message: { role: "assistant", content: [{ type: "text", text: "Now wire X." }] },
      assistantMessageEvent: { type: "text_delta", delta: "Now wire X." },
    },
    // Retry: same partial re-emitted with a stale duplicate delta. Appending
    // the delta would yield "Now wire X.Now wire X."; reconciling keeps it clean.
    {
      type: "message_update",
      message: { role: "assistant", content: [{ type: "text", text: "Now wire X." }] },
      assistantMessageEvent: { type: "text_delta", delta: "Now wire X." },
    },
    {
      type: "message_update",
      message: { role: "assistant", content: [{ type: "text", text: "Now wire X. Done." }] },
      assistantMessageEvent: { type: "text_delta", delta: " Done." },
    },
  ]);
  assert.equal((view[0] as { text: string }).text, "Now wire X. Done.");
  assert.deepEqual(r.transcript(), view);
});

test("user prompt carries image attachments", () => {
  const r = new TranscriptRecorder();
  const view = run(r, [
    {
      type: "message_start",
      message: {
        role: "user",
        content: [
          { type: "text", text: "look" },
          { type: "image", mimeType: "image/png", data: "AAAA" },
        ],
      },
    },
  ]);
  assert.deepEqual(view[0], {
    id: "u0",
    kind: "user",
    text: "look",
    images: [{ mimeType: "image/png", data: "AAAA" }],
  });
});

test("tool execution lifecycle", () => {
  const r = new TranscriptRecorder();
  const view = run(r, [
    {
      type: "tool_execution_start",
      toolCallId: "tc1",
      toolName: "bash",
      args: { command: "ls" },
    },
    {
      type: "tool_execution_end",
      toolCallId: "tc1",
      toolName: "bash",
      result: { content: [{ type: "text", text: "file.txt" }] },
      isError: false,
    },
  ]);
  assert.equal(view.length, 1);
  const t = view[0]!;
  assert.equal(t.kind, "tool");
  assert.equal((t as { status: string }).status, "done");
  assert.equal((t as { output: string }).output, "file.txt");
  assert.match((t as { argsSummary: string }).argsSummary, /ls/);
});

test("error stop reason surfaces on assistant item", () => {
  const r = new TranscriptRecorder();
  const view = run(r, [
    { type: "message_start", message: { role: "assistant", content: [] } },
    {
      type: "message_end",
      message: { role: "assistant", content: [], stopReason: "error", errorMessage: "boom" },
    },
  ]);
  assert.equal((view[0] as { error?: string }).error, "boom");
});

test("load rebuilds transcript from history with reset op", () => {
  const r = new TranscriptRecorder();
  const ops = r.load([
    { role: "user", content: [{ type: "text", text: "q1" }] },
    { role: "assistant", content: [{ type: "text", text: "a1" }] },
  ]);
  assert.equal(ops.length, 1);
  assert.equal(ops[0]!.op, "reset");
  const view = applyTranscriptOps([], ops);
  assert.equal(view.length, 2);
  assert.equal(view[1]!.kind, "assistant");
});

test("loadFromEntries renders the full active branch with compaction as an in-stream divider", () => {
  // Plan B: the GUI scrollback shows the WHOLE conversation, not the SDK's
  // compaction-trimmed `session.messages`. A compaction entry mid-branch must
  // render as a divider card while the messages before it stay visible — so
  // the user can still scroll above the compaction boundary.
  const r = new TranscriptRecorder();
  const ops = r.loadFromEntries([
    { id: "e0", type: "message", message: { role: "user", content: [{ type: "text", text: "first" }] } },
    { id: "e1", type: "message", message: { role: "assistant", content: [{ type: "text", text: "reply" }] } },
    { id: "e2", type: "compaction", summary: "## Goal\nrecap", tokensBefore: 200000 },
    { id: "e3", type: "message", message: { role: "user", content: [{ type: "text", text: "after" }] } },
    // Skipped: metadata + hidden injected context never appear as rows.
    { id: "e4", type: "model_change" },
    { id: "e5", type: "custom_message", display: false, content: "hidden" },
  ]);
  assert.equal(ops.length, 1);
  assert.equal(ops[0]!.op, "reset");
  const view = applyTranscriptOps([], ops);
  assert.equal(view.length, 4);
  assert.equal(view[0]!.kind, "user");
  assert.equal((view[0] as { text: string }).text, "first");
  // The compaction renders in place (keyed by its persisted entry id), and the
  // message before it is NOT fenced away.
  const divider = view[2]!;
  assert.equal(divider.kind, "compaction");
  assert.equal(divider.id, "e2");
  assert.equal((divider as { running: boolean }).running, false);
  assert.equal((divider as { summary?: string }).summary, "## Goal\nrecap");
  assert.equal((view[3] as { text: string }).text, "after");
  assert.deepEqual(r.transcript(), view);
});

test("pending send-time placeholders are dropped when the real user message_start arrives", () => {
  // PiSession.prompt seeds an optimistic user item + a vision-proxy notice
  // card (before_agent_start blocks the real user event). The recorder must
  // drop both when the echoed user message_start arrives — so the chat shows
  // the real user item, never a duplicate of the placeholder.
  const r = new TranscriptRecorder();
  // Seed via the same path PiSession uses (mutates recorder.items).
  let view = applyTranscriptOps([], r.seedPendingUser("see this", [
    { mimeType: "image/png", data: "Zm9v" },
  ]));
  assert.equal(view.length, 2, "pending user + vision-proxy card");
  // Real SDK event fires after before_agent_start returns.
  view = applyTranscriptOps(view, r.handleEvent({
    type: "message_start",
    message: { role: "user", content: [{ type: "text", text: "see this" }] },
  }));
  assert.equal(view.length, 1, "placeholders dropped, real user item remains");
  assert.equal(view[0]!.kind, "user");
  assert.equal((view[0] as { text: string }).text, "see this");
});

test("placeholders drop even when vision-proxy rewrites the user text", () => {
  // pi-vision-proxy replaces image-bearing user content with a textual
  // description before the run proceeds, so the real user message_start text
  // commonly differs from the sent text. A text-match drop would leave the
  // stale placeholder, producing two user bubbles (the bug). Sentinel-drop
  // by id must clear it regardless of echoed text.
  const r = new TranscriptRecorder();
  let view = applyTranscriptOps([], r.seedPendingUser("we just got stuck here", [
    { mimeType: "image/png", data: "AAAA" },
  ]));
  assert.equal(view.length, 2, "pending user + vision-proxy card");
  view = applyTranscriptOps(view, r.handleEvent({
    type: "message_start",
    message: {
      role: "user",
      content: [{ type: "text", text: "[Image - vision-proxy description (…) <vision_proxy_description …>…</vision_proxy_description>] we just got stuck here" }],
    },
  }));
  assert.equal(view.length, 1, "placeholder dropped even when text differs");
  assert.equal(view[0]!.kind, "user");
  assert.ok(
    (view[0] as { text: string }).text.includes("we just got stuck here"),
    "real echoed user item remains",
  );
});

test("text-only prompt seeds no optimistic placeholder", () => {
  // The vision-proxy placeholder covers the before_agent_start vision
  // round-trip, which only fires for image-bearing prompts. Text-only sends
  // echo promptly, so seeding a placeholder risks a stale duplicate when the
  // echoed text differs from the sent text. seedPendingUser must no-op.
  const r = new TranscriptRecorder();
  const ops = r.seedPendingUser("hi");
  assert.equal(ops.length, 0);
  assert.equal(r.transcript().length, 0);
});

test("delete op removes a placeholder item", () => {
  // The `delete` TranscriptOp (added for the vision-proxy placeholder flow)
  // must remove the matching id and leave siblings untouched.
  const start: TranscriptItem[] = [
    { id: "vp-pending-user-1", kind: "user", text: "see this" },
    { id: "vp-card-1", kind: "notice", text: "Analyzing image with vision proxy…" },
  ];
  const view = applyTranscriptOps(start, [
    { op: "delete", id: "vp-pending-user-1" },
    { op: "delete", id: "vp-card-1" },
  ]);
  assert.equal(view.length, 0);
});

test("compaction_start opens a transient running card", () => {
  const r = new TranscriptRecorder();
  const view = run(r, [{ type: "compaction_start", reason: "threshold" }]);
  assert.equal(view.length, 1);
  const card = view[0]!;
  assert.equal(card.kind, "compaction");
  assert.equal((card as { running: boolean }).running, true);
  assert.equal((card as { reason: string }).reason, "threshold");
});

test("compaction_end success patches the leaf card with reason and summary", () => {
  // The success path assumes PiSession has already reloaded the transcript
  // from the branch (loadFromEntries), leaving a persisted compaction entry at
  // the leaf. handleEvent(compaction_end) then patches that leaf with the
  // precise trigger reason + summary from the event result.
  const r = new TranscriptRecorder();
  // Simulate the post-reload branch: a persisted divider at the leaf (reason
  // defaults to "threshold" since persisted entries don't store the trigger).
  let view = applyTranscriptOps([], r.loadFromEntries([
    { id: "e1", type: "message", message: { role: "user", content: [{ type: "text", text: "q" }] } },
    { id: "e2", type: "compaction", summary: "old summary", tokensBefore: 1000 },
  ]));
  view = applyTranscriptOps(view, r.handleEvent({
    type: "compaction_end",
    reason: "manual",
    result: { summary: "## Goal\nfresh recap", tokensBefore: 20000 },
  }));
  assert.equal(view.length, 2);
  const leaf = view[1]!;
  assert.equal(leaf.kind, "compaction");
  assert.equal((leaf as { reason: string }).reason, "manual");
  assert.equal((leaf as { summary?: string }).summary, "## Goal\nfresh recap");
  assert.equal((leaf as { tokensBefore?: number }).tokensBefore, 20000);
  // tokensAfter derived from summary length (~4 chars/token).
  assert.equal((leaf as { tokensAfter?: number }).tokensAfter, Math.ceil("## Goal\nfresh recap".length / 4));
});

test("compaction_end failure finalises the transient card in place", () => {
  // On failure nothing is persisted, so there is no caller reload. The
  // recorder must finalise the transient running card (opened at start) in
  // place with the error, leaving it visible rather than silently dropped.
  const r = new TranscriptRecorder();
  const view = run(r, [
    { type: "compaction_start", reason: "manual" },
    { type: "compaction_end", reason: "manual", aborted: false, errorMessage: "boom" },
  ]);
  assert.equal(view.length, 1);
  const card = view[0]!;
  assert.equal(card.kind, "compaction");
  assert.equal((card as { running: boolean }).running, false);
  assert.equal((card as { error?: string }).error, "boom");
});

test("overlapping compaction_start finalises the orphaned card", () => {
  // A second compaction_start before the first ends must finalise the prior
  // still-running card so it doesn't spin forever, then open a new one. The
  // recorder returns both ops (orphan finalize + new running card); asserting
  // on the ops avoids same-millisecond Date.now() id collisions that only
  // happen when the test runs the two starts synchronously.
  const r = new TranscriptRecorder();
  const start1 = r.handleEvent({ type: "compaction_start", reason: "threshold" });
  assert.equal(start1.length, 1);
  assert.equal((start1[0]!.item as { running: boolean }).running, true);
  const start2 = r.handleEvent({ type: "compaction_start", reason: "manual" });
  assert.equal(start2.length, 2, "orphan finalize + new card");
  const orphan = start2[0]!.item as { running: boolean; aborted?: boolean; error?: string };
  assert.equal(orphan.running, false);
  assert.equal(orphan.aborted, true);
  assert.equal(orphan.error, "Superseded by a newer compaction");
  const live = start2[1]!.item as { running: boolean };
  assert.equal(live.running, true);
});

test("auto_retry_end drops trailing empty assistant error card", () => {
  // Final retry failure: SDK emits message_end(error) for the last attempt,
  // then auto_retry_end(success=false). The recorder must drop the redundant
  // empty assistant error card that lands after the retry card, so the only
  // visible failure surface is the finalised "gave up" retry card.
  const r = new TranscriptRecorder();
  const view = run(r, [
    { type: "agent_start" },
    { type: "message_start", message: { role: "user", content: [{ type: "text", text: "hi" }] } },
    { type: "message_start", message: { role: "assistant", content: [] } },
    { type: "message_end", message: { role: "assistant", content: [], stopReason: "error", errorMessage: "Connection error." } },
    { type: "auto_retry_start", attempt: 1, maxAttempts: 3, errorMessage: "Connection failed" },
    { type: "message_end", message: { role: "assistant", content: [], stopReason: "error", errorMessage: "Connection error." } },
    { type: "auto_retry_start", attempt: 2, maxAttempts: 3, errorMessage: "Connection failed" },
    { type: "message_end", message: { role: "assistant", content: [], stopReason: "error", errorMessage: "Connection error." } },
    { type: "auto_retry_start", attempt: 3, maxAttempts: 3, errorMessage: "Connection failed" },
    { type: "message_end", message: { role: "assistant", content: [], stopReason: "error", errorMessage: "Connection error." } },
    { type: "auto_retry_end", success: false, finalError: "Connection error." },
  ]);
  // user + retry card only; no trailing empty assistant error card
  assert.equal(view.length, 2);
  assert.equal(view[0]!.kind, "user");
  const retry = view[1]!;
  assert.equal(retry.kind, "retry");
  assert.equal((retry as { running: boolean }).running, false);
  assert.equal((retry as { attempt: number }).attempt, 3);
  assert.equal((retry as { error?: string }).error, "Connection error.");
});

test("agent_end attaches turn usage, cost, tokens/sec and TTFT to the final answer", async () => {
  const r = new TranscriptRecorder();
  r.handleEvent({ type: "agent_start" });
  r.handleEvent({ type: "message_start", message: { role: "assistant", content: [] } });
  // Wait so the start→first-token gap (TTFT) is measurable.
  await new Promise((res) => setTimeout(res, 15));
  r.handleEvent({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "Hi" } });
  await new Promise((res) => setTimeout(res, 15));
  let view: TranscriptItem[] = [];
  view = applyTranscriptOps(
    view,
    r.handleEvent({
      type: "message_end",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Hi" }],
        stopReason: "stop",
        usage: { input: 120, output: 30, cacheRead: 8, cacheWrite: 0, totalTokens: 158, cost: { total: 0.0021 } },
      },
    }),
  );
  // No footer mid-turn (before agent_end).
  assert.equal((view[0] as { usage?: unknown }).usage, undefined);
  view = applyTranscriptOps(view, r.handleEvent({ type: "agent_end" }));
  const a = view[0] as TranscriptItem & { kind: "assistant" };
  assert.ok(a.usage, "usage attached at agent_end");
  assert.equal(a.usage!.input, 120);
  assert.equal(a.usage!.output, 30);
  assert.equal(a.usage!.cacheRead, 8);
  assert.equal(a.usage!.totalTokens, 158);
  assert.equal(a.usage!.costUsd, 0.0021);
  assert.ok(a.usage!.ttftMs! >= 10, "TTFT measured from agent_start to first token");
  assert.ok(a.usage!.tokensPerSec! > 0, "tokens/sec derived from generation window");
});

test("multi-call turn aggregates into one footer on the final answer", () => {
  // A turn with a tool round-trip: assistant call #1 (then a tool), then the
  // final assistant answer. Only the last answer carries the summed footer.
  const r = new TranscriptRecorder();
  const view = run(r, [
    { type: "agent_start" },
    { type: "message_start", message: { role: "user", content: [{ type: "text", text: "go" }] } },
    { type: "message_start", message: { role: "assistant", content: [] } },
    { type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "…" } },
    { type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "working" }], stopReason: "toolUse", usage: { input: 100, output: 20, cacheRead: 0, cacheWrite: 0, totalTokens: 120, cost: { total: 0.001 } } } },
    { type: "tool_execution_start", toolCallId: "t1", toolName: "read", args: { path: "a.ts" } },
    { type: "tool_execution_end", toolCallId: "t1", toolName: "read", result: { content: [{ type: "text", text: "ok" }] } },
    { type: "message_start", message: { role: "assistant", content: [] } },
    { type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "done" } },
    { type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "done" }], stopReason: "stop", usage: { input: 200, output: 40, cacheRead: 5, cacheWrite: 0, totalTokens: 245, cost: { total: 0.003 } } } },
    { type: "agent_end" },
  ]);
  const assistants = view.filter((i) => i.kind === "assistant") as (TranscriptItem & { kind: "assistant" })[];
  assert.equal(assistants.length, 2);
  // First (intermediate) answer carries no footer.
  assert.equal(assistants[0]!.usage, undefined);
  // Final answer carries the summed totals.
  const u = assistants[1]!.usage!;
  assert.equal(u.input, 300);
  assert.equal(u.output, 60);
  assert.equal(u.cacheRead, 5);
  assert.equal(u.totalTokens, 365);
  assert.equal(u.costUsd, 0.004);
});

test("empty turn produces no footer; reload keeps tokens+cost but no timings", () => {
  const r = new TranscriptRecorder();
  // Zeroed-usage turn must not attach a footer even after agent_end.
  const live = run(r, [
    { type: "agent_start" },
    { type: "message_start", message: { role: "assistant", content: [] } },
    {
      type: "message_end",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "x" }],
        stopReason: "stop",
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
      },
    },
    { type: "agent_end" },
  ]);
  assert.equal((live[0] as { usage?: unknown }).usage, undefined);

  // Reload path: persisted usage survives (tokens + cost) but timings do not.
  const r2 = new TranscriptRecorder();
  const ops = r2.load([
    {
      role: "assistant",
      content: [{ type: "text", text: "done" }],
      usage: { input: 50, output: 10, cacheRead: 0, cacheWrite: 0, totalTokens: 60, cost: { total: 0.001 } },
    },
  ]);
  const item = (ops[0] as { items: TranscriptItem[] }).items[0] as TranscriptItem & { kind: "assistant" };
  assert.equal(item.usage!.totalTokens, 60);
  assert.equal(item.usage!.costUsd, 0.001);
  assert.equal(item.usage!.ttftMs, undefined);
  assert.equal(item.usage!.tokensPerSec, undefined);
});
