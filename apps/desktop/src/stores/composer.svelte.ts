import { SvelteMap } from "svelte/reactivity";
import type { CommandKind, QueueState, ReferencedConnection, ReferencedSecret } from "@peach-pi/shared-types";
import type { ComposerMode } from "../lib/composer/mode";
import type { ComposerAttachment } from "../lib/composer/attachments";
import { api } from "../lib/ipc";

export interface ComposerDraft {
  text: string;
  attachments: ComposerAttachment[];
  mode: ComposerMode;
  /** Selected slash command (skill/prompt/extension), shown as a chip and prepended on send. */
  command: { name: string; kind: CommandKind } | null;
  /** Connections pinned with `@`, shown as chips and hinted in the outgoing prompt. */
  connections: ReferencedConnection[];
  /** BWS secrets pinned with `@`, shown as chips and hinted (names+ids only). */
  secrets: ReferencedSecret[];
  /** Plan-mode full instructions already sent once in this thread. */
  planPromptSent: boolean;
}

const emptyDraft = (): ComposerDraft => ({
  text: "",
  attachments: [],
  mode: "build",
  command: null,
  connections: [],
  secrets: [],
  planPromptSent: false,
});

const STORAGE_KEY = "peach-pi:composer-drafts";
const PERSIST_DEBOUNCE_MS = 300;

/** True if a draft carries no recoverable content worth persisting. */
function isDraftEmpty(d: ComposerDraft): boolean {
  return (
    d.text === "" &&
    d.attachments.length === 0 &&
    d.command === null &&
    d.connections.length === 0 &&
    d.secrets.length === 0
  );
}

/** Hydrate drafts saved before the last renderer reload. */
function loadPersistedDrafts(): Map<string, ComposerDraft> {
  const out = new Map<string, ComposerDraft>();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return out;
    const parsed = JSON.parse(raw) as Record<string, Partial<ComposerDraft>>;
    for (const [id, d] of Object.entries(parsed)) {
      if (!d || typeof d.text !== "string") continue;
      const draft = { ...emptyDraft(), ...d };
      if (!isDraftEmpty(draft)) out.set(id, draft);
    }
  } catch {
    // Corrupt or unavailable — start fresh.
  }
  return out;
}

/** Serialize all non-empty drafts, or null if there is nothing to store. */
function serializeDrafts(byThread: Map<string, ComposerDraft>): string | null {
  const obj: Record<string, ComposerDraft> = {};
  for (const [id, d] of byThread) {
    if (isDraftEmpty(d)) continue;
    obj[id] = d;
  }
  return Object.keys(obj).length ? JSON.stringify(obj) : null;
}

/** Like serializeDrafts but drops base64 image attachments (quota fallback). */
function serializeLightDrafts(byThread: Map<string, ComposerDraft>): string | null {
  const obj: Record<string, ComposerDraft> = {};
  for (const [id, d] of byThread) {
    if (isDraftEmpty(d)) continue;
    const light = d.attachments.filter((a) => a.kind !== "image");
    obj[id] = light.length === d.attachments.length ? d : { ...d, attachments: light };
  }
  return Object.keys(obj).length ? JSON.stringify(obj) : null;
}

/**
 * Per-thread composer drafts. Mirrored to `localStorage` so a renderer reload
 * (⌘R / View → Reload) restores unsent text instead of wiping it. Survives
 * thread switching regardless. Not a source of truth — the JSONL session is.
 */
class DraftStore {
  private byThread = new SvelteMap<string, ComposerDraft>(loadPersistedDrafts());
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Flush any pending debounced write before the renderer tears down on reload.
    window.addEventListener("beforeunload", () => this.flushPersist());
  }

  /** Pure read — safe inside $derived. Missing drafts materialize on first update(). */
  for(threadId: string): ComposerDraft {
    return this.byThread.get(threadId) ?? emptyDraft();
  }

  update(threadId: string, patch: Partial<ComposerDraft>): void {
    this.byThread.set(threadId, { ...this.for(threadId), ...patch });
    this.schedulePersist();
  }

  clearText(threadId: string): void {
    this.update(threadId, { text: "", attachments: [], command: null, connections: [], secrets: [] });
  }

  private schedulePersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => this.flushPersist(), PERSIST_DEBOUNCE_MS);
  }

  private flushPersist(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    const json = serializeDrafts(this.byThread);
    try {
      if (json === null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, json);
    } catch {
      // Quota exceeded — usually base64 image attachments. Retry without them
      // so at least the text + lightweight chips survive the next reload.
      const light = serializeLightDrafts(this.byThread);
      try {
        if (light === null) localStorage.removeItem(STORAGE_KEY);
        else localStorage.setItem(STORAGE_KEY, light);
      } catch {
        // Still over quota (very large text) — keep in-memory only.
      }
    }
  }
}

/** Per-thread queued messages (steer/follow-up) mirrored from main. */
class QueueStore {
  private byThread = new SvelteMap<string, QueueState>();

  init(): void {
    api.on("event:queue", (q) => this.byThread.set(q.threadId, q));
  }

  for(threadId: string): QueueState {
    return this.byThread.get(threadId) ?? { threadId, steering: [], followUp: [] };
  }
}

export const drafts = new DraftStore();
export const queues = new QueueStore();
