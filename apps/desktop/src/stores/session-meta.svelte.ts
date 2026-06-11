import { SvelteMap } from "svelte/reactivity";
import type { ModelInfo, SessionMeta } from "@peach-pi/shared-types";
import { api } from "../lib/ipc";

/** Live per-thread session metadata (model, thinking, context usage). */
class SessionMetaStore {
  private byThread = new SvelteMap<string, SessionMeta>();
  private requested = new Set<string>();
  /** Available models are session-independent in practice; cache once. */
  models = $state<ModelInfo[]>([]);

  init(): void {
    api.on("event:sessionMeta", (meta) => this.byThread.set(meta.threadId, meta));
  }

  for(threadId: string): SessionMeta | null {
    return this.byThread.get(threadId) ?? null;
  }

  /** Lazily fetch meta once per thread; later updates flow via events. */
  ensure(threadId: string): void {
    if (this.requested.has(threadId)) return;
    this.requested.add(threadId);
    void api
      .invoke("threads:getMeta", threadId)
      .then((meta) => this.byThread.set(meta.threadId, meta))
      .catch(() => this.requested.delete(threadId));
  }

  async loadModels(threadId: string): Promise<void> {
    if (this.models.length > 0) return;
    this.models = await api.invoke("threads:listModels", threadId);
  }

  set(meta: SessionMeta): void {
    this.byThread.set(meta.threadId, meta);
  }
}

export const sessionMetas = new SessionMetaStore();
