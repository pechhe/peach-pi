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
