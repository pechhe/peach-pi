import type { AutoCompactSettings } from "@peach-pi/shared-types";
import { createIpcStore } from "./create-ipc-store.svelte";

/**
 * Auto-compaction thresholds. Persisted in main (KV) and enforced there after
 * each run; the renderer mirrors them to drive the Settings form and the
 * context-bar marker. A pure load/set mirror over `app:getAutoCompact` /
 * `app:setAutoCompact`.
 */
const store = createIpcStore<"app:getAutoCompact", "app:setAutoCompact">({
  loadChannel: "app:getAutoCompact",
  setChannel: "app:setAutoCompact",
  default: { percent: 80, tokens: null },
});

export const autoCompact = {
  get percent(): number {
    return store.state.percent;
  },
  get tokens(): number | null {
    return store.state.tokens;
  },
  load: (force?: boolean) => store.load(force),
  set: (settings: AutoCompactSettings) => store.set(settings),
};
