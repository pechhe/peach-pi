import type { RemoteFirstMode } from "@peach-pi/shared-types";
import { api } from "../lib/ipc";

/**
 * Remote-first mode (see docs/remote-handoff.md). When on, new threads start
 * on the target remote machine and messaging a thread hands it off there. The
 * Remote sidebar item glows + pulses while on. Inert when no remote machine is
 * registered (`hasRemoteMachine` false).
 */
class RemoteFirstStore {
  mode = $state<RemoteFirstMode>({
    enabled: false,
    targetMachine: null,
    hasRemoteMachine: false,
  });
  private loaded = false;

  init(): void {
    // Load the persisted state immediately so the sidebar lamp reflects
    // remote-first on startup (the lamp lives in the Sidebar, which is always
    // mounted — not gated on opening the Remote view).
    void this.load();
    // A handoff state change elsewhere (mode flip, machine registered, thread
    // handed off) — reload so the sidebar indicator + views stay live.
    api.on("event:handoffChanged", () => {
      void this.load(true);
    });
  }

  async load(force = false): Promise<void> {
    if (!force && this.loaded) return;
    this.loaded = true;
    try {
      this.mode = await api.invoke("handoff:getMode");
    } catch (err) {
      console.error("[remote-first] load failed", err);
    }
  }

  async toggle(next: boolean): Promise<void> {
    try {
      this.mode = await api.invoke("handoff:setMode", next);
    } catch (err) {
      console.error("[remote-first] toggle failed", err);
    }
  }
}

export const remoteFirst = new RemoteFirstStore();

// Survive vite HMR: a hot reload of this module swaps in a fresh singleton, so
// already-mounted components (the Sidebar glow) keep the stale instance. Accept
// the update and re-init the fresh singleton's listeners + state so the toggle
// and the sidebar glow stay coupled after a mid-session edit.
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    remoteFirst.init();
    void remoteFirst.load(true);
  });
}
