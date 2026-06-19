import { test } from "node:test";
import assert from "node:assert/strict";
import type { TranscriptItem } from "@peach-pi/shared-types";
import { mapTurns } from "../../src/lib/transcript/turns.ts";

const user = (id: string, text = id): TranscriptItem => ({ id, kind: "user", text });
const asst = (id: string): TranscriptItem => ({
  id,
  kind: "assistant",
  text: "ok",
  thinking: "",
  streaming: false,
});
const tool = (id: string): TranscriptItem => ({
  id,
  kind: "tool",
  toolName: "read",
  argsSummary: "",
  output: "",
  status: "done",
});
const compaction = (id: string): TranscriptItem => ({
  id,
  kind: "compaction",
  running: false,
  reason: "manual",
});

test("maps each user item to the matching fork entry by ordinal", () => {
  const items = [user("u1"), asst("a1"), user("u2"), asst("a2")];
  const turns = [
    { entryId: "e1", text: "u1" },
    { entryId: "e2", text: "u2" },
  ];
  const { endById, keepByEntry } = mapTurns(items, turns);

  // Turn 1 ends at its last item before the next user message (a1).
  assert.deepEqual(endById.get("a1"), { entryId: "e1", keepCount: 0 });
  // Turn 2 ends at the final item (a2).
  assert.deepEqual(endById.get("a2"), { entryId: "e2", keepCount: 2 });
  assert.equal(keepByEntry.get("e1"), 0);
  assert.equal(keepByEntry.get("e2"), 2);
});

test("ignores interleaved non-user items (tool, compaction) for correlation", () => {
  const items = [
    user("u1"),
    tool("t1"),
    asst("a1"),
    compaction("c1"),
    user("u2"),
    tool("t2"),
    asst("a2"),
  ];
  const turns = [
    { entryId: "e1", text: "u1" },
    { entryId: "e2", text: "u2" },
  ];
  const { endById, keepByEntry } = mapTurns(items, turns);

  // Turn 1's last item is the compaction card just before u2.
  assert.deepEqual(endById.get("c1"), { entryId: "e1", keepCount: 0 });
  // Turn 2 keeps everything up to (not incl.) u2 → index 4.
  assert.equal(keepByEntry.get("e2"), 4);
  assert.deepEqual(endById.get("a2"), { entryId: "e2", keepCount: 4 });
});

test("empty inputs yield empty maps", () => {
  assert.equal(mapTurns([], []).endById.size, 0);
  assert.equal(mapTurns([user("u1")], []).keepByEntry.size, 0);
  assert.equal(mapTurns([], [{ entryId: "e1", text: "x" }]).endById.size, 0);
});

test("more user items than known turns: unmatched tail is skipped safely", () => {
  const items = [user("u1"), asst("a1"), user("u2")];
  const turns = [{ entryId: "e1", text: "u1" }];
  const { endById, keepByEntry } = mapTurns(items, turns);
  assert.deepEqual(endById.get("a1"), { entryId: "e1", keepCount: 0 });
  assert.equal(keepByEntry.has("e1"), true);
  // u2 has no matching turn yet → no entry, no crash.
  assert.equal(keepByEntry.size, 1);
});
