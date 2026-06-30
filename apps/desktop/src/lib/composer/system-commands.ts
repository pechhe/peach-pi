/**
 * GUI-native "system" commands: slash aliases that fire GUI flows rather than
 * being sent to pi as text (e.g. `/model`, `/compact`, `/new`, `/btw`).
 *
 * Extracted from Composer.svelte so the host, SlashMenu, and QuickSlots share
 * one source of truth. The host still owns running these (they touch
 * host-owned handles like the model selector and onRewind/onNewThread
 * callbacks).
 */
import type { CommandInfo } from "@peach-pi/shared-types";

export const SYSTEM_COMMAND_LIST: CommandInfo[] = [
  { name: "model", description: "Choose the model", kind: "system" },
  { name: "compact", description: "Compact the conversation", kind: "system" },
  { name: "rewind", description: "Rewind the last turn (/rewind [n])", kind: "system" },
  { name: "btw", description: "Ask a side question (/btw <question>)", kind: "system" },
  { name: "plan", description: "Switch to Plan mode", kind: "system" },
  { name: "build", description: "Switch to Build mode", kind: "system" },
  { name: "new", description: "Start a new thread in this project", kind: "system" },
  { name: "branch", description: "Branch this thread into a new thread", kind: "system" },
  { name: "clone", description: "Clone this thread into a new thread", kind: "system" },
  { name: "fork", description: "Pick a turn to fork a new thread from", kind: "system" },
  { name: "reload", description: "Reload extensions/skills/prompts from disk", kind: "system" },
  { name: "scoped-models", description: "Pick which models appear in the composer", kind: "system" },
];

export const SYSTEM_COMMAND_NAMES = new Set(SYSTEM_COMMAND_LIST.map((c) => c.name));
