import { SvelteMap } from "svelte/reactivity";
import type { ExtensionUiRequest, NoticePayload } from "@peach-pi/shared-types";
import { api } from "../lib/ipc";

interface Toast extends NoticePayload {
  id: number;
}

/** Extension dialog queue + toast notifications + per-thread status text. */
class ExtensionUiStore {
  dialogs = $state<ExtensionUiRequest[]>([]);
  toasts = $state<Toast[]>([]);
  /** threadId → (key → text) */
  private statuses = new SvelteMap<string, SvelteMap<string, string>>();
  private toastSeq = 0;

  init(): void {
    api.on("event:extensionUi", (req) => {
      this.dialogs = [...this.dialogs, req];
    });
    api.on("event:notice", (notice) => this.pushToast(notice));
    api.on("event:extensionStatus", ({ threadId, key, text }) => {
      let map = this.statuses.get(threadId);
      if (!map) {
        map = new SvelteMap();
        this.statuses.set(threadId, map);
      }
      if (text === null) map.delete(key);
      else map.set(key, text);
    });
  }

  pushToast(notice: NoticePayload): void {
    const toast = { ...notice, id: ++this.toastSeq };
    this.toasts = [...this.toasts, toast];
    setTimeout(() => {
      this.toasts = this.toasts.filter((t) => t.id !== toast.id);
    }, 5000);
  }

  statusesFor(threadId: string): string[] {
    return [...(this.statuses.get(threadId)?.values() ?? [])];
  }

  async respond(requestId: string, value: string | boolean | undefined): Promise<void> {
    this.dialogs = this.dialogs.filter((d) => d.requestId !== requestId);
    await api.invoke("threads:respondExtensionUi", requestId, value);
  }
}

export const extensionUi = new ExtensionUiStore();
