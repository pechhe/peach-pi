/**
 * Record & Replay MCP server (stdio).
 *
 * Tools exposed:
 *   - start_recording         Begin capturing desktop input + window context.
 *   - stop_recording          Stop, persist events, return synthesis prompt.
 *   - cancel_recording        Stop + discard ALL captured data.
 *   - list_recordings         Show past recordings.
 *   - list_skills             Show synthesized skills.
 *   - find_skill(message)     Match a user message against saved skills.
 *   - load_skill(name)        Return a skill's full content for the LLM.
 *   - save_skill              Persist agent-authored skill.md body.
 *
 * Design: synthesis is authored by the running pi agent (not a separate LLM
 * call). stop_recording returns the digest + a system prompt; the agent then
 * calls save_skill with the markdown it wrote.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  defaultRoot, loadRecording, saveRecording, readEvents, saveSkill,
  listSkills, recordingManifestPath, discardRecording,
} from "./store.ts";
import { buildDigest, synthesisSystemPrompt } from "./synthesize.ts";
import { bestMatch, type MatchResult } from "./match.ts";
import {
  startCapture, stopCapture, killCapture, captureBinPath, type ActiveCapture,
} from "./capture.ts";
import { newRecordingId } from "./store.ts";
import { MATCH_THRESHOLD } from "./types.ts";
import { existsSync } from "node:fs";

const ROOT = defaultRoot();

/** In-memory active captures (single-process server). */
const active = new Map<string, ActiveCapture>();

const server = new McpServer({
  name: "record-and-replay",
  version: "0.1.0",
});

server.tool(
  "start_recording",
  "Start recording desktop input (clicks, keystrokes, text, window context). Returns a recording id. MACOS ONLY — requires Accessibility + Input Monitoring permissions granted to the host running pi. Auto-stops at 30 minutes.",
  {},
  async () => {
    const id = newRecordingId();
    const binPath = captureBinPath();
    const binOk = existsSync(binPath);
    if (!binOk) {
      // Still create the recording shell so lifecycle is consistent.
      startCapture(ROOT, id, binPath);
      return text(`Recording ${id} started, BUT the native capture binary was not found at ${binPath}. Run \`pnpm --filter peach-pi-record-replay build:native\` then restart the MCP server. No events will be captured until then.`);
    }
    const cap = startCapture(ROOT, id, binPath);
    active.set(id, cap);
    return text(`Recording ${id} started. Click/keystroke/window events are being captured. Call stop_recording to synthesize a skill, or cancel_recording to discard.`);
  },
);

const StopSchema = {
  recording_id: z.string().describe("Recording id from start_recording."),
  skill: z.string().optional().describe("Agent-authored skill.md content (frontmatter + sections). If omitted, the synthesis prompt is returned for the agent to author it."),
};

server.tool(
  "stop_recording",
  "Stop a recording. Persists the event log and returns either a synthesis prompt (if `skill` is omitted) or a save confirmation (if `skill` is provided). Also returns the semantic digest.",
  StopSchema,
  async (args) => {
    const id = args.recording_id;
    const cap = active.get(id);
    if (cap) {
      killCapture(cap);
      active.delete(id);
    }
    const { rec } = stopCapture(ROOT, id, "stop");
    if (!rec) return text(`No recording found for id ${id}.`, true);

    const events = readEvents(ROOT, id).map((l) => JSON.parse(l));
    const digest = buildDigest(events);

    if (args.skill) {
      const name = extractName(args.skill) ?? id;
      const path = saveSkill(ROOT, name, args.skill);
      saveRecording(ROOT, { ...rec, skillPath: path, digest });
      return text(`Recording ${id} stopped (${events.length} events, ${Math.round(rec.durationMs / 1000)}s). Skill saved to ${path}.`);
    }

    const prompt = synthesisSystemPrompt(digest, id);
    return text(
      `Recording ${id} stopped (${events.length} events, ${Math.round(rec.durationMs / 1000)}s).\n\n` +
      `Now author the skill. Follow these instructions and then call save_skill (or call stop_recording again with the skill body):\n\n` +
      `---SYNTHESIS PROMPT---\n${prompt}\n---END PROMPT---\n\n` +
      `---DIGEST---\n${digest}\n---END DIGEST---`,
    );
  },
);

server.tool(
  "cancel_recording",
  "Stop a recording and DISCARD all captured events. Nothing is persisted.",
  {
    recording_id: z.string().describe("Recording id from start_recording."),
  },
  async (args) => {
    const id = args.recording_id;
    const cap = active.get(id);
    if (cap) {
      killCapture(cap);
      active.delete(id);
    }
    stopCapture(ROOT, id, "cancel");
    return text(`Recording ${id} cancelled. All captured data discarded.`);
  },
);

server.tool("list_recordings", "List past recordings.", {}, async () => {
  // Cheap: scan the recordings dir via manifest paths.
  const { recordingsDir } = await import("./store.ts");
  const { readdirSync } = await import("node:fs");
  const dir = recordingsDir(ROOT);
  if (!existsSync(dir)) return text("No recordings yet.");
  const ids = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
  const lines = ids.map((id) => {
    const r = loadRecording(ROOT, id);
    return r ? `[${r.status}] ${r.id}  (${r.eventCount} evts, ${r.durationMs}ms)` : id;
  });
  return text(lines.join("\n") || "No recordings yet.");
});

server.tool("list_skills", "List synthesized skills saved from recordings.", {}, async () => {
  const skills = listSkills(ROOT);
  if (!skills.length) return text("No saved skills yet. Record a task and call stop_recording.");
  return text(skills.map((s) => `- ${s.name}: ${s.description} | triggers: ${s.triggers.join(", ")}`).join("\n"));
});

server.tool(
  "find_skill",
  "Match a user message against saved skills. Returns the best match above a confidence threshold, or 'no match'. Call this when a new user message arrives to decide whether to load a recorded skill.",
  { message: z.string().describe("The user's incoming message.") },
  async (args) => {
    const skills = listSkills(ROOT);
    if (!skills.length) return text("No saved skills to match against.");
    const m: MatchResult | null = bestMatch(args.message, skills, MATCH_THRESHOLD);
    if (!m) return text(`No skill matched above threshold (${MATCH_THRESHOLD}).`);
    return text(`Best match: "${m.skill.name}" (score ${m.score.toFixed(3)} via ${m.via}). description: ${m.skill.description}\nCall load_skill with name="${m.skill.name}" to load it.`);
  },
);

server.tool(
  "load_skill",
  "Load a skill's full content into context as instructions. Call after find_skill returns a match, or for explicit /skill <name> invocation.",
  { name: z.string().describe("Skill name (filename without .md).") },
  async (args) => {
    const { skillPath } = await import("./store.ts");
    const { readFileSync } = await import("node:fs");
    const p = skillPath(ROOT, args.name);
    if (!existsSync(p)) return text(`No skill named "${args.name}".`, true);
    return text(`Load the following as instructions:\n\n${readFileSync(p, "utf8")}`);
  },
);

server.tool(
  "save_skill",
  "Persist an agent-authored skill.md body. Used after stop_recording returns a synthesis prompt and the agent has written the markdown.",
  {
    name: z.string().describe("Skill name (kebab-case, filename without .md)."),
    body: z.string().describe("Full skill.md content with frontmatter."),
  },
  async (args) => {
    const path = saveSkill(ROOT, args.name, args.body);
    return text(`Skill saved to ${path}.`);
  },
);

function text(content: string, isError = false): { content: { type: "text"; text: string }[]; isError?: boolean } {
  return { content: [{ type: "text", text: content }], ...(isError ? { isError: true } : {}) };
}

function extractName(body: string): string | null {
  const m = body.match(/^name:\s*(\S+)/m);
  return m?.[1] ?? null;
}

export async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Run when invoked as the entry. Skip only under a known test/REPL import.
import { fileURLToPath } from "node:url";
const isEntry = (() => {
  try {
    return fileURLToPath(import.meta.url) === process.argv[1];
  } catch {
    return true;
  }
})();
if (isEntry) {
  main().catch((err) => {
    console.error("[record-and-replay] fatal:", err);
    process.exit(1);
  });
}
