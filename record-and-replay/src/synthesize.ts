/**
 * Skill synthesis. We do NOT call an LLM directly — we hand the running pi
 * agent a compact "digest" of the recorded events plus a system prompt, and
 * the agent authors `skill.md` itself. This keeps the MCP server free of API
 * keys and lets the agent use whichever model it is already running as.
 */

import type { RecordEvent } from "./types.ts";

/**
 * Compress the raw event stream into a compact, human/LLM-readable digest.
 * Collapses consecutive text events, dedups window-title noise, keeps click
 * targets, focused values, and URLs — the semantic substrate the synthesizer
 * needs. Raw events are still persisted; the digest is what's shown to the LLM.
 */
export function buildDigest(events: RecordEvent[]): string {
  const lines: string[] = [];
  let lastWindow: string | undefined;
  let textBuffer = "";
  let lastTextT = -1;

  const flushText = (atT: number) => {
    if (textBuffer) {
      lines.push(`[${ms(atT)}] typed: ${JSON.stringify(textBuffer)}`);
      textBuffer = "";
    }
  };

  for (const e of events) {
    switch (e.type) {
      case "session_start":
        lines.push(`[0:00] === recording start ===`);
        break;
      case "window": {
        const p = e.payload as { action?: string; window?: string };
        if (p.window && p.window !== lastWindow && p.action !== "deactivate") {
          lastWindow = p.window;
          lines.push(`[${ms(e.t)}] window: ${p.action ?? "?"} "${p.window}"`);
        }
        break;
      }
      case "focus": {
        const p = e.payload as { url?: string; value?: string; element?: string; role?: string };
        if (p.url) lines.push(`[${ms(e.t)}] url: ${p.url}`);
        const focusCtx = [p.role, p.element, p.value].filter(Boolean).join(" / ");
        if (focusCtx) lines.push(`[${ms(e.t)}] focus: ${focusCtx}`);
        break;
      }
      case "click": {
        const p = e.payload as { target?: string; window?: string; role?: string; value?: string; targetPath?: string[] };
        flushText(e.t);
        const ctx = [p.role, p.target, p.value].filter(Boolean).join(" / ");
        const pathStr = p.targetPath && p.targetPath.length > 0 ? ` path=[${p.targetPath.join(" > ")}]` : "";
        lines.push(`[${ms(e.t)}] click: ${ctx || "(no target)"} @ ${p.window ?? ""}${pathStr}`.trim());
        break;
      }
      case "keypress": {
        const p = e.payload as { key: string };
        flushText(e.t);
        // Only surface non-character keys (combos, navigation) — chars are in text events.
        if (p.key.length > 1 || p.key.includes("+")) {
          lines.push(`[${ms(e.t)}] key: ${p.key}`);
        }
        break;
      }
      case "text": {
        const p = e.payload as { text: string };
        if (lastTextT === -1) lastTextT = e.t;
        textBuffer += p.text;
        break;
      }
      case "scroll": {
        // Compress scroll bursts: only log direction changes.
        break;
      }
      case "screenshot": {
        const p = e.payload as { path?: string; trigger?: string; index?: number };
        if (p.path) {
          lines.push(`[${ms(e.t)}] screenshot: ${p.path} (trigger: ${p.trigger ?? "?"}, #${p.index ?? "?"})`);
        }
        break;
      }
      case "note": {
        const p = e.payload as { note: string };
        lines.push(`[${ms(e.t)}] NOTE: ${p.note}`);
        break;
      }
      default:
        break;
    }
  }
  flushText(lastTextT);
  return lines.join("\n");
}

function ms(t: number): string {
  const s = Math.floor(t / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * The instructions the running pi agent receives. The agent writes the final
 * `skill.md` content to disk (via its normal write tool) and passes it back
 * through `stop_recording`'s skill parameter, OR returns it from the call.
 */
export function synthesisSystemPrompt(digest: string, recordingId: string): string {
  return `You are converting a desktop task recording into a reusable skill file.

A user recorded themselves performing a recurring task. Below is a semantic digest of the captured events (window titles, click targets with AX role/value + ancestor path, typed text, URLs, focused elements, and SCREENSHOTS taken at each significant action). Raw pixel coordinates have been abstracted away.

## CRITICAL: read the screenshots before writing the skill

The digest contains lines like:
  [0:05] screenshot: /abs/path/00003.png (trigger: click, #3)

Those PNG files ARE the recording. The text digest alone is brittle (Notion/Electron often expose no AX labels — clicks show as "(no target)"). The screenshots are what lets you infer real intent, the way Codex's Record & Replay does.

Before writing the skill:
1. Collect every screenshot path listed in the digest.
2. Call analyze_image on them (batch multiple paths per call, up to 20 images). Use a focused question per batch, e.g. "What UI element is highlighted/clicked here, and what is the user about to do?" Group by timestamps and surrounding actions in the digest.
3. Cross-reference what you see in the screenshots with the AX target / typed text / focus events at the same timestamp.
4. Only then write the skill — grounded in what the screenshots show, not just the text labels.

Your job: infer the high-level GOAL, then write a procedural skill anyone (or any agent) could follow to reproduce it.

Rules:
- Identify the goal in 1-2 sentences.
- Break the workflow into numbered steps in PLAIN ENGLISH.
- ABSTRACT away literal coordinates/UI chrome into semantic actions ("open Google Sheets", "navigate to Hacker News", "copy the title of the top story"). Use the screenshot-grounded understanding of what each click was actually doing.
- Prefer the most robust execution path, in this order, and note the chosen path per step:
  1. Programmatic (CLI, script, API, connector) — always best; no UI at all.
  2. Web pages → the \`agent-browser\` CLI skill (DOM-aware, web-native).
  3. Native desktop UI → the \`cua-driver\` CLI skill (background native computer use; for macOS apps, system dialogs, menu bar, anything with no web/API surface).
  Only fall back down the list when the path above has no clean route.
- Capture triggers: natural-language phrases a user might say that should invoke this skill.
- Be conservative: only assert what the recording shows. If the goal is ambiguous, say so in Notes.

Output EXACTLY this markdown format (frontmatter + sections). Do not wrap in code fences:

---
name: <short-kebab-name>
description: <~200 char summary used for auto-matching>
triggers: ["phrase one", "phrase two"]
created: <ISO timestamp>
---

## Overview
<1-2 sentence goal description>

## Prerequisites
<tools, connectors, or permissions needed, e.g. macOS Accessibility + Screen Recording, Google Sheets API token>

## Workflow
1. <step>
2. <step>

## Notes
<caveats, e.g. "prefer Google Sheets API over browser clicks when available">

--- BEGIN RECORDED DIGEST (recording ${recordingId}) ---
${digest}
--- END RECORDED DIGEST ---`;
}
