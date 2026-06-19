// DevTap pi extension (v1) — harness-side reader + interactive control.
//
// Registers a `devtap` tool and a `/devtap` command. Reads the JSONL runtime
// stream produced by the in-app tap, and (when the app runs with DEV_TAP=1 and
// its control channel is up) can request on-demand screenshots and state dumps.
//
// Install once, globally: symlink/copy this directory to
//   ~/.pi/agent/extensions/devtap/
// It is project-agnostic: it locates `.pi/devtap.jsonl` from the session cwd.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

interface TapEvent {
  ts?: string;
  level?: string;
  source?: string;
  area?: string;
  event?: string;
  message?: string;
  durationMs?: number;
  payload?: unknown;
  error?: { name: string; message: string; stack?: string };
}

function findRepoRoot(start: string): string {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}

function logPath(cwd: string): string {
  return process.env.DEVTAP_LOG || join(findRepoRoot(cwd), ".pi", "devtap.jsonl");
}

function requestsDir(cwd: string): string {
  return join(dirname(logPath(cwd)), "devtap", "requests");
}

function parseLog(cwd: string): { path: string; exists: boolean; events: TapEvent[]; malformed: number } {
  const path = logPath(cwd);
  if (!existsSync(path)) return { path, exists: false, events: [], malformed: 0 };
  const events: TapEvent[] = [];
  let malformed = 0;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line) as TapEvent);
    } catch {
      malformed++;
    }
  }
  return { path, exists: true, events, malformed };
}

function summarize(ev: TapEvent): string {
  const dur = ev.durationMs != null ? ` (${ev.durationMs}ms)` : "";
  const msg = ev.message ? ` — ${ev.message}` : "";
  const err = ev.error ? ` :: ${ev.error.name}: ${ev.error.message}` : "";
  return `${ev.ts ?? "?"} ${(ev.level ?? "info").toUpperCase()} ${ev.source ?? "?"}/${ev.area ?? "?"} ${ev.event ?? "?"}${msg}${dur}${err}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Write a control request, then poll the stream for the matching result event. */
async function requestControl(
  cwd: string,
  cmd: "screenshot" | "state",
  resultEvent: string,
  timeoutMs = 15000,
): Promise<TapEvent | null> {
  const baseline = parseLog(cwd).events.length;
  const id = randomUUID();
  const dir = requestsDir(cwd);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${id}.json`), JSON.stringify({ id, cmd }));
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(250);
    const events = parseLog(cwd).events.slice(baseline);
    const hit = events.find(
      (e) =>
        (e.event === resultEvent || e.event === `${resultEvent}.error`) &&
        (e.payload as { requestId?: string } | undefined)?.requestId === id,
    );
    if (hit) return hit;
  }
  return null;
}

function text(s: string) {
  return { content: [{ type: "text" as const, text: s }], details: {} };
}

async function run(action: string, lines: number, full: boolean, ctx: ExtensionContext): Promise<string> {
  const cwd = ctx.cwd;
  switch (action) {
    case "status": {
      const { path, exists, events, malformed } = parseLog(cwd);
      if (!exists) return `DevTap: no stream at ${path}. Run the app with DEV_TAP=1.`;
      const errors = events.filter((e) => e.level === "error").length;
      return [
        `DevTap stream: ${path}`,
        `Events: ${events.length}  Errors: ${errors}  Malformed: ${malformed}`,
        events[0]?.ts ? `Range: ${events[0].ts} → ${events[events.length - 1]?.ts}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    }
    case "tail": {
      const { exists, events } = parseLog(cwd);
      if (!exists) return "DevTap: no stream yet. Run the app with DEV_TAP=1.";
      return events
        .slice(-lines)
        .map((e) => summarize(e) + (full && e.payload !== undefined ? `\n    payload: ${JSON.stringify(e.payload)}` : ""))
        .join("\n") || "(empty)";
    }
    case "errors": {
      const { exists, events } = parseLog(cwd);
      if (!exists) return "DevTap: no stream yet. Run the app with DEV_TAP=1.";
      const errs = events.filter((e) => e.level === "error").slice(-lines);
      if (errs.length === 0) return "No error-level events.";
      return errs
        .map((e) => summarize(e) + (e.error?.stack ? `\n    ${e.error.stack.split("\n").join("\n    ")}` : ""))
        .join("\n\n");
    }
    case "clear": {
      const path = logPath(cwd);
      if (existsSync(path)) writeFileSync(path, "");
      return `DevTap stream cleared: ${path}`;
    }
    case "screenshot": {
      const hit = await requestControl(cwd, "screenshot", "devtap.screenshot");
      if (!hit) return "Screenshot timed out. Is the app running with DEV_TAP=1?";
      const file = (hit.payload as { file?: string } | undefined)?.file;
      return file
        ? `Screenshot saved: ${file}\nRead it with the read tool to view.`
        : `Screenshot request failed: ${hit.message ?? "unknown"}`;
    }
    case "state": {
      const hit = await requestControl(cwd, "state", "devtap.state");
      if (!hit) return "State request timed out. Is the app running with DEV_TAP=1?";
      return `Live app state:\n${JSON.stringify((hit.payload as { state?: unknown } | undefined)?.state, null, 2)}`;
    }
    default:
      return `Unknown action: ${action}`;
  }
}

export default function (pi: ExtensionAPI): void {
  pi.registerTool({
    name: "devtap",
    label: "DevTap",
    description:
      "Inspect the running app's DevTap runtime stream (lifecycle, errors, IPC) and request live screenshots/state. Use to diagnose actual app behavior, not just source.",
    promptSnippet: "Inspect runtime evidence from the running app (events, errors, IPC, screenshots, state)",
    promptGuidelines: [
      "Use devtap to gather runtime evidence (errors, IPC timing, screenshots, live state) when diagnosing how the running app actually behaves.",
    ],
    parameters: Type.Object({
      action: StringEnum(["status", "tail", "errors", "clear", "screenshot", "state"] as const),
      lines: Type.Optional(Type.Number({ description: "For tail/errors: how many recent events (default 50)" })),
      full: Type.Optional(Type.Boolean({ description: "For tail: include sanitized payloads" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return text(await run(params.action, params.lines ?? 50, params.full ?? false, ctx));
    },
  });

  pi.registerCommand("devtap", {
    description: "Inspect the DevTap runtime stream (status|tail|errors|clear|screenshot|state)",
    getArgumentCompletions: (prefix: string) => {
      const items = ["status", "tail", "errors", "clear", "screenshot", "state"].map((v) => ({ value: v, label: v }));
      const f = items.filter((i) => i.value.startsWith(prefix));
      return f.length > 0 ? f : null;
    },
    handler: async (args, ctx) => {
      const action = (args.trim().split(/\s+/)[0] || "status");
      ctx.ui.notify(await run(action, 50, false, ctx), "info");
    },
  });
}
