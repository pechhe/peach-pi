/**
 * Recording + skill persistence. Pure-ish: file I/O lives here, logic is
 * deterministic given a root dir. Default root = agent home so recordings
 * and skills sit next to pi's own skills directory.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { Recording, SkillMeta } from "./types.ts";

export function defaultRoot(): string {
  return join(homedir(), ".pi", "agent");
}

export function recordingsDir(root: string): string {
  return join(root, "recordings");
}

export function skillsDir(root: string): string {
  // Skills go to a subfolder of pi's global skills dir so pi discovers them.
  return join(root, "skills", "recorded");
}

export function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/** Recording id = timestamp-based, sortable, filesystem-safe. */
export function newRecordingId(now = new Date()): string {
  const pad = (n: number, l = 2) => String(n).padStart(l, "0");
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-` +
    `${pad(now.getMilliseconds(), 3)}`
  );
}

export function recordingManifestPath(root: string, id: string): string {
  return join(recordingsDir(root), `${id}.json`);
}

export function recordingEventsPath(root: string, id: string): string {
  return join(recordingsDir(root), `${id}.events.ndjson`);
}

/** Directory holding screenshots captured during a recording. */
export function shotsDir(root: string, id: string): string {
  return join(recordingsDir(root), `${id}.shots`);
}

export function skillPath(root: string, name: string): string {
  return join(skillsDir(root), `${name}.md`);
}

export function saveRecording(root: string, rec: Recording): void {
  ensureDir(recordingsDir(root));
  writeFileSync(recordingManifestPath(root, rec.id), JSON.stringify(rec, null, 2));
}

export function loadRecording(root: string, id: string): Recording | null {
  const p = recordingManifestPath(root, id);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as Recording;
}

export function appendEvent(root: string, id: string, line: string): void {
  ensureDir(recordingsDir(root));
  appendFileSync(recordingEventsPath(root, id), line + "\n");
}

export function readEvents(root: string, id: string): string[] {
  const p = recordingEventsPath(root, id);
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8")
    .split("\n")
    .filter(Boolean);
}

export function discardRecording(root: string, id: string): void {
  for (const p of [recordingManifestPath(root, id), recordingEventsPath(root, id), shotsDir(root, id)]) {
    if (existsSync(p)) rmSync(p, { force: true, recursive: true });
  }
}

/** Save a generated skill file. Returns final path. */
export function saveSkill(root: string, name: string, body: string): string {
  const p = skillPath(root, name);
  ensureDir(dirname(p));
  writeFileSync(p, body);
  return p;
}

/** Parse frontmatter (--- ... ---) + return metadata + body. Lenient. */
export function parseSkill(path: string): SkillMeta | null {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf8");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m || !m[1]) return null;
  const front = m[1]!;
  const meta = {
    name: field(front, "name") ?? pathBasename(path),
    description: field(front, "description") ?? "",
    triggers: list(front, "triggers"),
    created: field(front, "created") ?? "",
    path,
  };
  return meta;
}

function field(front: string, key: string): string | undefined {
  const re = new RegExp(`^${key}:\\s*(.+)$`, "m");
  const m = front.match(re);
  return m?.[1]?.replace(/^["']|["']$/g, "")?.trim();
}

function list(front: string, key: string): string[] {
  const re = new RegExp(`^${key}:\\s*\\[(.*)\\]$`, "m");
  const m = front.match(re);
  if (m?.[1]) return m[1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  // multiline list form:
  const block = front.match(new RegExp(`^${key}:\\n((?:\\s+-\\s.+\\n?)+)`, "m"));
  if (block?.[1]) {
    return [...block[1].matchAll(/^\s+-\s+(.+)$/gm)].map((m) => m[1]!.replace(/^["']|["']$/g, "").trim());
  }
  return [];
}

function pathBasename(p: string): string {
  return p.split("/").pop()?.replace(/\.md$/, "") ?? "skill";
}

/** List all saved (recorded) skills, newest first. */
export function listSkills(root: string): SkillMeta[] {
  const dir = skillsDir(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => parseSkill(join(dir, f)))
    .filter((s): s is SkillMeta => s !== null)
    .sort((a, b) => b.created.localeCompare(a.created));
}

export { resolve };
