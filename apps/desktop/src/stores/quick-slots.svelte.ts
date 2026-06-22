/**
 * Quick-access slots: a 2×2 drawer of custom actions in the composer. Each
 * slot holds a slash command (skill / extension / prompt / system) that the
 * user either fires once or treats as a toggle. Global UI preference (not
 * per-thread), persisted to localStorage like command-prefs.svelte.ts. The
 * `storage` event keeps every window in sync.
 *
 * Phase 1: behaviors are "fire" (run/inject once), "toggle" (two manual
 * commands + a locally-tracked on/off LED) and "bound" (a store-backed toggle
 * whose real state lives elsewhere — currently only Caveman). Phase 2 adds an
 * LLM probe that auto-fills toggle on/off commands.
 */

import type { CommandKind } from "@peach-pi/shared-types";

export const SLOT_COUNT = 4;

export type SlotBehavior =
  | { type: "fire" }
  | { type: "toggle"; on: string; off: string }
  | { type: "bound"; binding: "caveman" };

export interface QuickSlot {
  ref: { kind: CommandKind; name: string };
  label: string;
  behavior: SlotBehavior;
}

const SLOTS_KEY = "peachpi:quickSlots";
const TOGGLES_KEY = "peachpi:quickSlotToggles";

const DEFAULT_SLOTS: (QuickSlot | null)[] = [
  {
    ref: { kind: "extension", name: "caveman" },
    label: "Caveman",
    behavior: { type: "bound", binding: "caveman" },
  },
  null,
  null,
  null,
];

function pad<T>(arr: T[], fill: T): T[] {
  const out = arr.slice(0, SLOT_COUNT);
  while (out.length < SLOT_COUNT) out.push(fill);
  return out;
}

function readSlots(): (QuickSlot | null)[] {
  try {
    const raw = localStorage.getItem(SLOTS_KEY);
    if (!raw) return DEFAULT_SLOTS.map((s) => (s ? { ...s } : null));
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_SLOTS.map((s) => (s ? { ...s } : null));
    return pad(
      parsed.map((s): QuickSlot | null =>
        s && typeof s === "object" && s.ref && s.behavior ? (s as QuickSlot) : null,
      ),
      null,
    );
  } catch {
    return DEFAULT_SLOTS.map((s) => (s ? { ...s } : null));
  }
}

function readToggles(): boolean[] {
  try {
    const raw = localStorage.getItem(TOGGLES_KEY);
    if (!raw) return pad([], false);
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? pad(parsed.map(Boolean), false) : pad([], false);
  } catch {
    return pad([], false);
  }
}

class QuickSlotsStore {
  slots = $state<(QuickSlot | null)[]>(pad([], null));
  /** Local on/off state for "toggle" behaviors, indexed by slot. */
  toggles = $state<boolean[]>(pad([], false));
  private initialized = false;

  init(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.slots = readSlots();
    this.toggles = readToggles();
    window.addEventListener("storage", (e) => {
      if (e.key === SLOTS_KEY) this.slots = readSlots();
      if (e.key === TOGGLES_KEY) this.toggles = readToggles();
    });
  }

  private persistSlots(): void {
    try {
      localStorage.setItem(SLOTS_KEY, JSON.stringify(this.slots));
    } catch {
      /* ignore */
    }
  }

  private persistToggles(): void {
    try {
      localStorage.setItem(TOGGLES_KEY, JSON.stringify(this.toggles));
    } catch {
      /* ignore */
    }
  }

  assign(index: number, slot: QuickSlot): void {
    if (index < 0 || index >= SLOT_COUNT) return;
    this.slots = this.slots.map((s, i) => (i === index ? slot : s));
    this.toggles = this.toggles.map((v, i) => (i === index ? false : v));
    this.persistSlots();
    this.persistToggles();
  }

  clear(index: number): void {
    if (index < 0 || index >= SLOT_COUNT) return;
    this.slots = this.slots.map((s, i) => (i === index ? null : s));
    this.toggles = this.toggles.map((v, i) => (i === index ? false : v));
    this.persistSlots();
    this.persistToggles();
  }

  /** Flip a "toggle" behavior's local LED state and return the new value. */
  flipToggle(index: number): boolean {
    const next = !this.toggles[index];
    this.toggles = this.toggles.map((v, i) => (i === index ? next : v));
    this.persistToggles();
    return next;
  }
}

export const quickSlots = new QuickSlotsStore();
