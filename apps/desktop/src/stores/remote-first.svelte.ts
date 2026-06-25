import { createIpcStore } from "./create-ipc-store.svelte";
import { api } from "../lib/ipc";

/**
 * Remote-first mode (see docs/remote-handoff.md). When on, new threads start
 * on the target remote machine and messaging a thread hands it off there. The
 * Remote sidebar item glows + pulses while on. Inert when no remote machine is
 * registered (`hasRemoteMachine` false).
 *
 * The load/set mirror (`handoff:getMode` / `handoff:setMode`) is owned by the
 * factory; the cross-window listener + HMR guard stay explicit here, since
 * they are not part of the load/set loop.
 */
const store = createIpcStore<"handoff:getMode", "handoff:setMode">({
  loadChannel: "handoff:getMode",
  setChannel: "handoff:setMode",
  default: { enabled: false, targetMachine: null, hasRemoteMachine: false },
});

export const remoteFirst = {
  get mode() {
    return store.state;
  },
  /** Load + start listening for cross-window handoff state changes. Idempotent. */
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
  },
  load: (force = false) => store.load(force),
  toggle: (next: boolean) => store.set(next),
};

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
