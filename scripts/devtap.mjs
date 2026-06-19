#!/usr/bin/env node
// DevTap reader (harness-side). Inspects the JSONL runtime stream produced by
// the in-app tap. Parses defensively: malformed lines are skipped and counted,
// never fatal. No dependencies.
//
// Usage:
//   pnpm devtap status
//   pnpm devtap tail [--lines N] [--full]
//   pnpm devtap errors [--lines N]
//   pnpm devtap clear
//
// This is the v0 in-repo reader. It will later become a pi DevTap extension
// (registers a `devtap` tool + `/devtap` command) installed once, globally.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

function findRepoRoot(start) {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
}

function logPath() {
  return process.env.DEVTAP_LOG || join(findRepoRoot(process.cwd()), ".pi", "devtap.jsonl");
}

function parseLog() {
  const path = logPath();
  if (!existsSync(path)) return { path, exists: false, events: [], malformed: 0 };
  const raw = readFileSync(path, "utf8");
  const events = [];
  let malformed = 0;
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      malformed++;
    }
  }
  return { path, exists: true, events, malformed };
}

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : fallback;
}

function summarize(ev) {
  const ts = ev.ts ?? "?";
  const lvl = (ev.level ?? "info").toUpperCase().padEnd(5);
  const src = (ev.source ?? "?").padEnd(8);
  const area = (ev.area ?? "?").padEnd(10);
  const dur = ev.durationMs != null ? ` (${ev.durationMs}ms)` : "";
  const msg = ev.message ? ` — ${ev.message}` : "";
  const err = ev.error ? ` :: ${ev.error.name}: ${ev.error.message}` : "";
  return `${ts} ${lvl} ${src} ${area} ${ev.event}${msg}${dur}${err}`;
}

function printEvents(events, full) {
  for (const ev of events) {
    console.log(summarize(ev));
    if (full && ev.payload !== undefined) {
      console.log("        payload:", JSON.stringify(ev.payload));
    }
    if (ev.error?.stack) {
      console.log(
        ev.error.stack
          .split("\n")
          .map((l) => `        ${l}`)
          .join("\n"),
      );
    }
  }
}

const cmd = process.argv[2] ?? "status";
const lines = Number(arg("--lines", "50")) || 50;
const full = process.argv.includes("--full");

switch (cmd) {
  case "status": {
    const { path, exists, events, malformed } = parseLog();
    if (!exists) {
      console.log(`DevTap: no stream yet at ${path}`);
      console.log("Run the app with DEV_TAP=1 to start capturing.");
      break;
    }
    const errors = events.filter((e) => e.level === "error").length;
    const first = events[0]?.ts;
    const last = events[events.length - 1]?.ts;
    console.log(`DevTap stream: ${path}`);
    console.log(`Events: ${events.length}  Errors: ${errors}  Malformed lines: ${malformed}`);
    if (first) console.log(`Range: ${first} → ${last}`);
    break;
  }
  case "tail": {
    const { exists, events, malformed } = parseLog();
    if (!exists) {
      console.log("DevTap: no stream yet. Run the app with DEV_TAP=1.");
      break;
    }
    if (malformed) console.log(`(skipped ${malformed} malformed line(s))`);
    printEvents(events.slice(-lines), full);
    break;
  }
  case "errors": {
    const { exists, events, malformed } = parseLog();
    if (!exists) {
      console.log("DevTap: no stream yet. Run the app with DEV_TAP=1.");
      break;
    }
    if (malformed) console.log(`(skipped ${malformed} malformed line(s))`);
    const errs = events.filter((e) => e.level === "error").slice(-lines);
    if (errs.length === 0) console.log("No error-level events.");
    else printEvents(errs, true);
    break;
  }
  case "clear": {
    const path = logPath();
    writeFileSync(path, "");
    console.log(`DevTap stream cleared: ${path}`);
    break;
  }
  default:
    console.log(`Unknown command: ${cmd}`);
    console.log("Usage: pnpm devtap <status|tail|errors|clear> [--lines N] [--full]");
    process.exit(1);
}
