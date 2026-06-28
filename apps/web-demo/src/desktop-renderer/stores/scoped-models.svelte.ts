import type { ScopedModel } from "@peach-pi/shared-types";
import { createIpcStore } from "./create-ipc-store.svelte";
import { api } from "../lib/ipc";

/**
 * Global model scoping (pi's `enabledModels` in settings.json). Mirrors the
 * composer's "All" → "+ scope" toggle, exposed here so the Settings view can
 * manage scope without a thread. An empty scope means every model is
 * implicitly scoped (pi `/model`) — surfaced as all-scoped in the UI.
 *
 * The load/set mirror (`app:listScopedModels` / `app:setModelScoped`) is owned
 * by the factory; the cross-window `event:scopeChanged` reload listener stays
 * explicit here.
 */
const store = createIpcStore<"app:listScopedModels", "app:setModelScoped">({
  loadChannel: "app:listScopedModels",
  setChannel: "app:setModelScoped",
  default: [],
});

export const scopedModels = {
  get models(): ScopedModel[] {
    return store.state;
  },
  /** Start listening for cross-window scope changes. Idempotent. */
  init(): void {
    // Another window/session changed the scope — reload so Settings stays live.
    api.on("event:scopeChanged", () => {
      void this.load(true);
    });
  },
  load: (force = false) => store.load(force),
  toggle: (provider: string, id: string, scoped: boolean) =>
    store.set(provider, id, scoped),
};
