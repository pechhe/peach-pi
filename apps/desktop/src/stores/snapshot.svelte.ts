import type { AppSnapshot } from "@peach-pi/shared-types";
import { api } from "../lib/ipc";

/** Read model of main-process state. Renderer never mutates it directly. */
class SnapshotStore {
  current = $state<AppSnapshot | null>(null);

  async init(): Promise<void> {
    this.current = await api.invoke("app:getSnapshot");
    api.on("event:snapshot", (snapshot) => {
      this.current = snapshot;
    });
  }
}

export const snapshot = new SnapshotStore();
