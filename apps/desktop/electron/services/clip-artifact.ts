/**
 * Clip artifact — projects a finished record-and-replay capture into the
 * agent-readable Clips contract (frames + metadata). The contract shape mirrors
 * agent-native Clips so the directory is wire-compatible if ever served over
 * HTTP. Phase 1: no transcript (no audio capture yet) — frames + metadata only.
 *
 * `buildClipContext` is pure (events → manifest) so it is unit-testable without
 * touching the filesystem; `writeClip` copies frames + writes the manifest.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ClipChapter, ClipContext, ClipFrame, ImagePayload } from "@peach-pi/shared-types";
import type { RecordEvent } from "@peach-pi/record-replay/src/types.ts";

/** Root holding all clip artifacts: ~/.pi/agent/clips. */
export function clipsRoot(): string {
  return join(homedir(), ".pi", "agent", "clips");
}

export function clipDir(id: string): string {
  return join(clipsRoot(), id);
}

/** Build the agent-readable manifest from a capture's events. Pure. */
export function buildClipContext(
  id: string,
  events: RecordEvent[],
  durationMs: number,
  createdAt: string,
): ClipContext {
  const frames: ClipFrame[] = [];
  const chapters: ClipChapter[] = [];
  let lastChapter = "";
  for (const e of events) {
    if (e.type === "screenshot") {
      const p = e.payload as { trigger?: string };
      frames.push({ atMs: e.t, path: `frames/${e.t}.png`, label: p.trigger });
    } else if (e.type === "window") {
      const p = e.payload as { action?: string; window?: string };
      if (p.action === "activate" && p.window && p.window !== lastChapter) {
        chapters.push({ startMs: e.t, title: p.window });
        lastChapter = p.window;
      }
    }
  }
  return {
    id,
    title: null,
    summary: null,
    durationMs,
    createdAt,
    transcript: { status: "pending", path: null },
    chapters,
    frames,
  };
}

/** Project a finished recording into a self-contained clip dir: copy each
 *  screenshot into frames/<atMs>.png and write context.json. */
export function writeClip(
  id: string,
  events: RecordEvent[],
  durationMs: number,
  createdAt: string,
): { context: ClipContext; contextPath: string; dir: string } {
  const dir = clipDir(id);
  const framesDir = join(dir, "frames");
  mkdirSync(framesDir, { recursive: true });

  const context = buildClipContext(id, events, durationMs, createdAt);
  for (const e of events) {
    if (e.type !== "screenshot") continue;
    const src = (e.payload as { path?: string }).path;
    if (src && existsSync(src)) copyFileSync(src, join(framesDir, `${e.t}.png`));
  }
  const contextPath = join(dir, "context.json");
  writeFileSync(contextPath, JSON.stringify(context, null, 2), "utf8");
  return { context, contextPath, dir };
}

/** Load a written clip manifest. */
export function loadClipContext(id: string): ClipContext | null {
  const p = join(clipDir(id), "context.json");
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8")) as ClipContext;
}

/** Read a clip's frames as base64 ImagePayloads for injection into a thread. */
export function clipFramesAsImages(ctx: ClipContext, id: string): ImagePayload[] {
  const dir = clipDir(id);
  const out: ImagePayload[] = [];
  for (const f of ctx.frames) {
    const abs = join(dir, f.path);
    if (existsSync(abs)) {
      out.push({ mimeType: "image/png", data: readFileSync(abs).toString("base64") });
    }
  }
  return out;
}
