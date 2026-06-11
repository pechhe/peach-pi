import { SvelteMap } from "svelte/reactivity";
import type { QueueState } from "@peach-pi/shared-types";
import type { ComposerMode } from "../lib/composer/mode";
import type { ComposerAttachment } from "../lib/composer/attachments";
import { api } from "../lib/ipc";

export interface ComposerDraft {
  text: string;
  attachments: ComposerAttachment[];
  mode: ComposerMode;
  /** Plan-mode full instructions already sent once in this thread. */
  planPromptSent: boolean;
}

const emptyDraft = (): ComposerDraft => ({
  text: "",
  attachments: [],
  mode: "build",
  planPromptSent: false,
});

/** Per-thread composer drafts (in-memory; survives thread switching). */
class DraftStore {
  private byThread = new SvelteMap<string, ComposerDraft>();

  for(threadId: string): ComposerDraft {
    let draft = this.byThread.get(threadId);
    if (!draft) {
      draft = emptyDraft();
      this.byThread.set(threadId, draft);
    }
    return draft;
  }

  update(threadId: string, patch: Partial<ComposerDraft>): void {
    this.byThread.set(threadId, { ...this.for(threadId), ...patch });
  }

  clearText(threadId: string): void {
    this.update(threadId, { text: "", attachments: [] });
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
