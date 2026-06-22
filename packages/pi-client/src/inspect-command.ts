/**
 * Quick-slot toggle inspection: a modular "probe + classify" for deciding
 * whether an arbitrary slash command (skill / extension / prompt) is best used
 * as an on/off TOGGLE and, if so, what its on/off commands are.
 *
 *   probe()    — gathers evidence about the command (description + source text)
 *   classify() — one cheap utility-LLM call that turns evidence into a spec
 *
 * The two stages are decoupled: extend the probe with more evidence sources
 * without touching the classifier. The result is persisted into the slot by the
 * renderer, so the LLM only runs once (at assignment time), never on click.
 */

import { readFile } from "node:fs/promises";
import type { CommandKind, SlotToggleSpec } from "@peach-pi/shared-types";
import { inspectResources } from "./inspect-resources.ts";
import { completeUtility, type UtilityModelConfig } from "./utility-model.ts";

const SOURCE_LIMIT = 12_000;

const SYSTEM_PROMPT = [
  "You analyze a coding-agent slash command and decide whether it behaves as an",
  "on/off TOGGLE (a persistent mode the user turns on and later turns off) or a",
  "one-shot action that just runs once. Reply with ONLY minified JSON — no prose,",
  "no markdown fences — matching exactly:",
  '{"isToggle":boolean,"on":string|null,"off":string|null,"label":string,"reason":string}.',
  'When isToggle is true: "on" is the exact slash command that enables it (e.g.',
  '"/caveman full") and "off" is the exact slash command that disables it (e.g.',
  '"/caveman off"). When isToggle is false set both on and off to null. "label"',
  "is a short Title Case name (max 12 chars). Decide only from the provided name,",
  "description and source.",
].join(" ");

/** Collect human-readable evidence about a command for the classifier. */
async function probe(cwd: string, kind: CommandKind, name: string): Promise<string | null> {
  const res = await inspectResources(cwd);

  if (kind === "skill") {
    const skill = res.skills.find((s) => s.name === name);
    if (!skill) return null;
    const body = await readFile(skill.filePath, "utf8").catch(() => "");
    return [
      `Kind: skill`,
      `Name: ${name}`,
      `Description: ${skill.description}`,
      body ? `Source (${skill.filePath}):\n${body.slice(0, SOURCE_LIMIT)}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  if (kind === "extension") {
    const ext = res.extensions.find((e) => e.name === name || e.commands.includes(name));
    if (!ext) return null;
    const body = ext.path ? await readFile(ext.path, "utf8").catch(() => "") : "";
    return [
      `Kind: extension`,
      `Name: ${name}`,
      `Registered commands: ${ext.commands.join(", ") || "(none)"}`,
      body ? `Source (${ext.path}):\n${body.slice(0, SOURCE_LIMIT)}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  if (kind === "prompt") {
    const prompt = res.prompts.find((p) => p.name === name);
    if (!prompt) return null;
    return [`Kind: prompt`, `Name: ${name}`, `Description: ${prompt.description}`].join("\n\n");
  }

  return null;
}

/** Turn the evidence into a SlotToggleSpec via a strict-JSON utility call. */
function parseSpec(text: string, fallbackLabel: string): SlotToggleSpec | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const o = JSON.parse(match[0]) as Record<string, unknown>;
    return {
      isToggle: o.isToggle === true,
      on: typeof o.on === "string" ? o.on : null,
      off: typeof o.off === "string" ? o.off : null,
      label: typeof o.label === "string" && o.label.trim() ? o.label.trim() : fallbackLabel,
      reason: typeof o.reason === "string" ? o.reason : "",
    };
  } catch {
    return null;
  }
}

/**
 * Inspect a command and propose toggle behavior. Returns null when there is no
 * evidence to inspect or no utility model is configured (caller falls back to
 * manual entry).
 */
export async function inspectCommandToggle(
  cwd: string,
  kind: CommandKind,
  name: string,
  utilityConfig?: UtilityModelConfig | null,
): Promise<SlotToggleSpec | null> {
  const evidence = await probe(cwd, kind, name);
  if (!evidence) return null;
  const text = await completeUtility(utilityConfig, {
    systemPrompt: SYSTEM_PROMPT,
    userText: evidence,
    inputLimit: SOURCE_LIMIT + 500,
    temperature: 0.1,
    maxTokens: 250,
  });
  if (!text) return null;
  return parseSpec(text, name);
}
