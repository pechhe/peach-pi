import { test } from "node:test";
import assert from "node:assert/strict";
import { TranscriptRecorder } from "../../../../packages/pi-client/src/transcript-recorder.ts";
import { collectAgents } from "../../src/lib/subagent/journey.svelte.ts";
import { parseFleet } from "../../src/lib/subagent/fleet.ts";
import type { TranscriptItem } from "@peach-pi/shared-types";

type SubItem = Extract<TranscriptItem, { kind: "subagent" }>;

/** Drive the recorder with a start+end pair and return the final subagent item. */
function recordCall(
  callId: string,
  toolName: "subagent" | "subagent_resume",
  args: unknown,
  result?: unknown,
): SubItem {
  const rec = new TranscriptRecorder();
  rec.handleEvent({ type: "tool_execution_start", toolCallId: callId, toolName, args });
  if (result !== undefined) {
    rec.handleEvent({ type: "tool_execution_end", toolCallId: callId, toolName, args, result });
  }
  const item = rec.transcript().find((i) => i.id === callId);
  assert.ok(item && item.kind === "subagent", "expected a subagent item");
  return item as SubItem;
}

test("recorder: running spawn before result has running status", () => {
  const rec = new TranscriptRecorder();
  rec.handleEvent({
    type: "tool_execution_start",
    toolCallId: "c1",
    toolName: "subagent",
    args: { name: "impl-1", agent: "implementer", task: "do it" },
  });
  const item = rec.transcript()[0] as SubItem;
  assert.equal(item.kind, "subagent");
  assert.equal(item.verb, "spawn");
  assert.deepEqual(item.rows, [
    { name: "impl-1", agent: "implementer", title: undefined, task: "do it", summary: undefined, status: "running", elapsed: undefined },
  ]);
});

test("recorder: completed spawn pulls status/elapsed/summary from result details", () => {
  const item = recordCall(
    "c1",
    "subagent",
    { name: "impl-1", agent: "implementer", task: "do it" },
    { details: { status: "completed", name: "impl-1", agent: "implementer", elapsed: 5, summary: "shipped" } },
  );
  assert.equal(item.rows.length, 1);
  assert.equal(item.rows[0]!.status, "completed");
  assert.equal(item.rows[0]!.elapsed, 5);
  assert.equal(item.rows[0]!.summary, "shipped");
});

test("recorder: batch launch yields one row per child", () => {
  const item = recordCall(
    "c1",
    "subagent",
    { children: [{ name: "a", agent: "scout" }, { name: "b", agent: "verifier" }] },
    { details: { children: [{ name: "a", status: "completed" }, { name: "b", status: "failed", errorMessage: "boom" }] } },
  );
  assert.equal(item.rows.length, 2);
  assert.equal(item.rows[0]!.name, "a");
  assert.equal(item.rows[0]!.status, "completed");
  assert.equal(item.rows[1]!.status, "failed");
  assert.equal(item.rows[1]!.summary, "boom");
});

test("recorder: subagent_resume gets resume verb", () => {
  const item = recordCall("c2", "subagent_resume", { name: "impl-1", task: "keep going" });
  assert.equal(item.verb, "resume");
});

test("collectAgents merges a spawn and a later resume of the same name", () => {
  const items: TranscriptItem[] = [
    { id: "c1", kind: "subagent", verb: "spawn", createdAt: "2026-01-01T00:00:00Z", rows: [{ name: "impl-1", agent: "implementer", task: "do it", status: "completed" }] },
    { id: "c2", kind: "subagent", verb: "resume", createdAt: "2026-01-01T00:01:00Z", rows: [{ name: "impl-1", task: "yes implement", status: "running" }] },
  ];
  const { entities, primaryNamesByCall } = collectAgents(items);
  assert.equal(entities.size, 1);
  const entity = entities.get("impl-1")!;
  assert.equal(entity.events.length, 2);
  assert.deepEqual(entity.events.map((e) => e.verb), ["Spawn", "Resume"]);
  assert.equal(entity.agent, "implementer");
  assert.deepEqual(primaryNamesByCall.get("c1"), ["impl-1"]);
  assert.equal(primaryNamesByCall.get("c2"), undefined);
});

test("collectAgents splits a batch into one entity per child", () => {
  const items: TranscriptItem[] = [
    { id: "c1", kind: "subagent", verb: "spawn", createdAt: "2026-01-01T00:00:00Z", rows: [{ name: "a", agent: "scout", status: "running" }, { name: "b", agent: "verifier", status: "running" }] },
  ];
  const { entities, primaryNamesByCall } = collectAgents(items);
  assert.equal(entities.size, 2);
  assert.deepEqual(primaryNamesByCall.get("c1"), ["a", "b"]);
});

test("parseFleet reads count, agent badge, title and activity", () => {
  const fleet = parseFleet([
    "● Agents · 2 running · 12.3s",
    "├─ ◜ auth-scout [scout] · 3 tool uses · 12.5%/200k ctx",
    "│    Auth implementation map",
    "│    reading…",
    "└─ ◜ diff-reviewer [reviewer] · 1 tool use",
    "     Review the diff",
    "     thinking…",
  ]);
  assert.ok(fleet);
  assert.equal(fleet!.count, 2);
  assert.equal(fleet!.agents.length, 2);
  assert.equal(fleet!.agents[0]!.name, "auth-scout");
  assert.equal(fleet!.agents[0]!.agent, "scout");
  assert.deepEqual([...fleet!.agents[0]!.stats], ["3 tool uses", "12.5%/200k ctx"]);
  assert.equal(fleet!.agents[0]!.title, "Auth implementation map");
  assert.equal(fleet!.agents[0]!.activity, "reading…");
  assert.equal(fleet!.agents[1]!.activity, "thinking…");
});

test("parseFleet returns null for empty input", () => {
  assert.equal(parseFleet([]), null);
});
