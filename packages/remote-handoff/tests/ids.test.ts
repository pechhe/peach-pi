import { test } from "node:test";
import assert from "node:assert/strict";
import {
  genThreadId,
  recoveryBranchName,
  slugify,
  threadBranch,
  wipCommitMessage,
} from "../src/ids.ts";

test("genThreadId is short, lowercase, hex-suffixed and unique-ish", () => {
  const id = genThreadId();
  assert.match(id, /^thread_[0-9a-f]{6}$/);
  const seen = new Set<string>();
  for (let i = 0; i < 500; i++) seen.add(genThreadId());
  // 6 hex bits = 16^6 ≈ 16M; 500 draws should not collide in practice.
  assert.equal(seen.size, 500);
});

test("threadBranch embeds the id and a slugified description", () => {
  const branch = threadBranch("thread_a1b2c3", "Work on Auth Flow!!");
  assert.equal(branch, "peach/thread_a1b2c3-work-on-auth-flow");
  // id is always present so the branch traces back without a lookup.
  assert.ok(branch.includes("thread_a1b2c3"));
});

test("threadBranch falls back to 'task' for empty/numeric-only names", () => {
  assert.equal(threadBranch("thread_a1b2c3", "   "), "peach/thread_a1b2c3-task");
});

test("slugify trims, lowercases, collapses non-alphanumerics", () => {
  assert.equal(slugify("UI Polish & Refactor"), "ui-polish-refactor");
  assert.equal(slugify("___---___"), "task");
});

test("wipCommitMessage matches the spec format", () => {
  assert.equal(
    wipCommitMessage("thread_abc123"),
    "wip(thread_abc123): checkpoint before handoff",
  );
});

test("recoveryBranchName is machine-scoped and timestamped (local time)", () => {
  const d = new Date("2026-06-24T14:30:00Z");
  const name = recoveryBranchName("thread_abc123", "home", d);
  // Stamp is local time; rebuild the expected with the same helper so the test
  // is timezone-independent.
  const pad = (n: number) => String(n).padStart(2, "0");
  const expected =
    `recovery/thread_abc123-home-` +
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}`;
  assert.equal(name, expected);
  // Machine names with spaces get slugified.
  const host = recoveryBranchName("thread_x", "Henry MBP", d);
  assert.match(host, /^recovery\/thread_x-henry-mbp-/);
});
