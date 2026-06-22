import { test } from "node:test";
import { strict as assert } from "node:assert";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, existsSync } from "node:fs";

import {
  defaultRoot, recordingsDir, skillsDir, newRecordingId,
  saveRecording, loadRecording, appendEvent, readEvents,
  discardRecording, saveSkill, parseSkill, listSkills, shotsDir,
} from "../src/store.ts";
import {
  processLine, MAX_DURATION_MS,
} from "../src/capture.ts";
import { tokenize, termFreq, cosine, bestMatch, rankSkills } from "../src/match.ts";
import { buildDigest, synthesisSystemPrompt } from "../src/synthesize.ts";
import type { RecordEvent, SkillMeta } from "../src/types.ts";

let root: string;
test.before(() => {
  root = mkdtempSync(join(tmpdir(), "rr-test-"));
});
test.after(() => {
  rmSync(root, { recursive: true, force: true });
});

// --- store / paths ---
test("dirs nested under root", () => {
  assert.match(recordingsDir(root), RegExp(`${root}/recordings$`));
  assert.match(skillsDir(root), RegExp(`${root}/skills/recorded$`));
});

test("recording id is filesystem-safe + sortable", () => {
  const id = newRecordingId(new Date("2026-06-19T12:00:00.123Z"));
  assert.ok(!id.includes(":"));
  assert.match(id, /^20260619-/);
});

test("save + load recording round-trips", () => {
  const id = newRecordingId();
  saveRecording(root, {
    id, startedAt: new Date().toISOString(), stoppedAt: null, durationMs: 0,
    eventCount: 0, status: "active", eventsPath: "", skillPath: null, digest: null,
  });
  const loaded = loadRecording(root, id);
  assert.equal(loaded?.id, id);
  assert.equal(loaded?.status, "active");
});

test("appendEvent + readEvents persists NDJSON lines", () => {
  const id = newRecordingId();
  appendEvent(root, id, JSON.stringify({ t: 0, ts: "x", type: "click", payload: { x: 1, y: 2, button: "left" } }));
  appendEvent(root, id, JSON.stringify({ t: 10, ts: "y", type: "text", payload: { text: "hi" } }));
  const evts = readEvents(root, id);
  assert.equal(evts.length, 2);
});

test("discardRecording removes manifest + events + shots dir", () => {
  const id = newRecordingId();
  appendEvent(root, id, '{"t":0}');
  // Simulate a screenshot dir created during the recording.
  const dir = shotsDir(root, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "00001.png"), "fake");
  discardRecording(root, id);
  assert.equal(loadRecording(root, id), null);
  assert.equal(readEvents(root, id).length, 0);
  assert.equal(existsSync(dir), false, "shots dir should be removed");
});

test("saveSkill + parseSkill round-trips frontmatter incl triggers array", () => {
  const body = `---
name: hn-summary
description: summary of top hacker news story
triggers: ["summarize hn", "top hacker news"]
created: 2026-06-19T12:00:00.000Z
---

## Overview
Grabs top HN story and summarizes it.
`;
  const path = saveSkill(root, "hn-summary", body);
  const meta = parseSkill(path);
  assert.equal(meta?.name, "hn-summary");
  assert.equal(meta?.description, "summary of top hacker news story");
  assert.deepEqual(meta?.triggers, ["summarize hn", "top hacker news"]);
  assert.equal(meta?.created, "2026-06-19T12:00:00.000Z");
});

test("listSkills returns newest-first + skips malformed", () => {
  // Isolated root so the parseSkill test's left-over file doesn't leak in.
  const sub = mkdtempSync(join(tmpdir(), "rr-list-"));
  try {
    saveSkill(sub, "older", skillBody("older", "2026-01-01T00:00:00.000Z"));
    saveSkill(sub, "newer", skillBody("newer", "2026-06-01T00:00:00.000Z"));
    const skills = listSkills(sub);
    assert.equal(skills[0]?.name, "newer");
    assert.equal(skills[1]?.name, "older");
  } finally {
    rmSync(sub, { recursive: true, force: true });
  }
});

function skillBody(name: string, created: string): string {
  return `---\nname: ${name}\ndescription: d\ntriggers: ["x"]\ncreated: ${created}\n---\n## Overview\no\n`;
}

// --- capture.processLine + cap ---
test("processLine validates + rejects malformed", () => {
  const ok = processLine('{"t":0,"ts":"2026","type":"click","payload":{"x":1,"y":2,"button":"left"}}');
  assert.equal(ok?.type, "click");
  assert.equal(processLine("not json"), null);
  assert.equal(processLine('{"t":0}'), null); // missing fields
  assert.equal(processLine(""), null);
});

test("MAX_DURATION_MS is 30 minutes", () => {
  assert.equal(MAX_DURATION_MS, 30 * 60 * 1000);
});

// --- match ---
test("tokenize drops stop words + short tokens", () => {
  const t = tokenize("Please do my the homework");
  assert.deepEqual(t, ["homework"]);
});

test("cosine on identical vectors is 1, disjoint is 0", () => {
  const a = termFreq(["a", "b", "a"]);
  const b = termFreq(["a", "b", "a"]);
  assert.ok(Math.abs(cosine(a, b) - 1) < 1e-9);
  const c = termFreq(["x", "y"]);
  assert.equal(cosine(a, c), 0);
});

test("bestMatch returns top skill above threshold", () => {
  const skills: SkillMeta[] = [
    { name: "hn", description: "summarize top hacker news story", triggers: ["summarize hn", "top hacker news"], created: "2026", path: "/a" },
    { name: "sheets", description: "append a row to a google sheet", triggers: ["add google sheets row"], created: "2026", path: "/b" },
  ];
  const m = bestMatch("summarize the top hacker news story for me", skills, 0.1);
  assert.equal(m?.skill.name, "hn");
  assert.ok((m?.score ?? 0) > 0);
});

test("bestMatch returns null below threshold", () => {
  const skills: SkillMeta[] = [
    { name: "hn", description: "hacker news", triggers: ["hn"], created: "2026", path: "/a" },
  ];
  assert.equal(bestMatch("weather forecast", skills, 0.9), null);
});

test("rankSkills boosts exact trigger substring", () => {
  const skills: SkillMeta[] = [
    { name: "deploy", description: "deploy app", triggers: ["deploy my app"], created: "2026", path: "/a" },
  ];
  const r = rankSkills("please deploy my app now", skills);
  assert.equal(r[0]?.skill.name, "deploy");
  assert.ok((r[0]?.score ?? 0) > 0.2, "should include boost");
});

// --- synthesize ---
test("buildDigest collapses text + keeps clicks, urls, windows, notes", () => {
  const events: RecordEvent[] = [
    { t: 0, ts: "x", type: "session_start", payload: { reason: "start" } },
    { t: 1000, ts: "x", type: "window", payload: { action: "title", window: "Hacker News" } },
    { t: 2000, ts: "x", type: "focus", payload: { url: "https://news.ycombinator.com" } },
    { t: 3000, ts: "x", type: "click", payload: { x: 10, y: 20, button: "left", target: "Points 100" } },
    { t: 4000, ts: "x", type: "text", payload: { text: "hello" } },
    { t: 4100, ts: "x", type: "text", payload: { text: " world" } },
    { t: 5000, ts: "x", type: "click", payload: { x: 1, y: 1, button: "left", target: "Comment" } },
    { t: 6000, ts: "x", type: "note", payload: { note: "this is the goal" } },
  ];
  const d = buildDigest(events);
  assert.match(d, /recording start/);
  assert.match(d, /window: title "Hacker News"/);
  assert.match(d, /url: https:\/\/news\.ycombinator\.com/);
  assert.match(d, /click: Points 100/);
  assert.match(d, /typed: "hello world"/, "consecutive text events coalesced");
  assert.match(d, /NOTE: this is the goal/);
});

test("buildDigest shows AX role/value on clicks + ancestor paths", () => {
  const events: RecordEvent[] = [
    { t: 0, ts: "x", type: "click", payload: { x: 5, y: 5, button: "left", target: "Submit", role: "AXButton", value: "Submit", targetPath: ["Modal", "Form"] } },
    { t: 1000, ts: "x", type: "click", payload: { x: 9, y: 9, button: "left" } },
  ];
  const d = buildDigest(events);
  assert.match(d, /click: AXButton \/ Submit \/ Submit @ .*path=\[Modal > Form\]/);
  assert.match(d, /click: \(no target\)/);
});

test("buildDigest emits screenshot lines with path + trigger + index", () => {
  const events: RecordEvent[] = [
    { t: 500, ts: "x", type: "click", payload: { x: 1, y: 1, button: "left", target: "foo" } },
    { t: 600, ts: "x", type: "screenshot", payload: { path: "/tmp/00001.png", trigger: "click", index: 1 } },
    { t: 2000, ts: "x", type: "screenshot", payload: { path: "/tmp/00002.png", trigger: "focus", index: 2 } },
  ];
  const d = buildDigest(events);
  assert.match(d, /screenshot: \/tmp\/00001\.png \(trigger: click, #1\)/);
  assert.match(d, /screenshot: \/tmp\/00002\.png \(trigger: focus, #2\)/);
});

test("synthesisSystemPrompt embeds digest + mandates skill.md format", () => {
  const p = synthesisSystemPrompt("DIGEST_HERE", "rec-1");
  assert.match(p, /RECORDED DIGEST \(recording rec-1\)/);
  assert.match(p, /DIGEST_HERE/);
  assert.match(p, /name: <short-kebab-name>/);
  assert.match(p, /## Workflow/);
  assert.match(p, /prefer.*programmatic|API|script/i);
});

test("synthesisSystemPrompt instructs agent to read screenshots via analyze_image", () => {
  const p = synthesisSystemPrompt("", "rec-1");
  assert.match(p, /CRITICAL: read the screenshots before writing the skill/);
  assert.match(p, /analyze_image/);
  assert.match(p, /screenshot: /);  // shows the example line format
  assert.match(p, /macOS Accessibility \+ Screen Recording/);
});
