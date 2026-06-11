import { applyTranscriptOps, type TranscriptItem } from "@peach-pi/shared-types";
import { SvelteMap } from "svelte/reactivity";
import { api } from "../lib/ipc";

/** Per-thread transcript views, fed by main-process ops. */
class TranscriptStore {
  private byThread = new SvelteMap<string, TranscriptItem[]>();
  private loaded = new Set<string>();

  init(): void {
    api.on("event:transcript", ({ threadId, ops }) => {
      this.byThread.set(threadId, applyTranscriptOps(this.byThread.get(threadId) ?? [], ops));
    });
  }

  itemsFor(threadId: string): TranscriptItem[] {
    return this.byThread.get(threadId) ?? [];
  }

  /** Ensure history is loaded once per thread (resume case). */
  async ensure(threadId: string): Promise<void> {
    if (this.loaded.has(threadId)) return;
    this.loaded.add(threadId);
    const items = await api.invoke("threads:getTranscript", threadId);
    // Live ops may have arrived while we awaited; full fetch wins only if newer is empty.
    if ((this.byThread.get(threadId) ?? []).length === 0) {
      this.byThread.set(threadId, items);
    }
  }
}

export const transcripts = new TranscriptStore();
