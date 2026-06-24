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

/** Per-thread composer drafts (in-memory; survives thread switching). */
class DraftStore {
  private byThread = new SvelteMap<string, ComposerDraft>();

  /** Pure read — safe inside $derived. Missing drafts materialize on first update(). */
  for(threadId: string): ComposerDraft {
    return this.byThread.get(threadId) ?? emptyDraft();
  }

  update(threadId: string, patch: Partial<ComposerDraft>): void {
    this.byThread.set(threadId, { ...this.for(threadId), ...patch });
  }

  clearText(threadId: string): void {
    this.update(threadId, { text: "", attachments: [], command: null, connections: [], secrets: [] });
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
