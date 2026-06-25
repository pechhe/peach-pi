import type {
  InvokeArgs,
  InvokeChannel,
  InvokeResult,
  NoArgInvokeChannel,
} from "@peach-pi/shared-types";
import { api } from "../lib/ipc";

/**
 * Renderer store that is a pure mirror of a single load/set IPC pair:
 * `load()` invokes the load channel and assigns `$state`; `set(...)` invokes
 * the set channel and assigns the returned value. The `$state` holds the whole
 * payload (identity shape — no field mapping), so consumers read
 * `store.state.<field>`.
 *
 * Use this for stores whose only job is marshaling IPC into reactive state.
 * Stores with real multi-channel logic (caveman, vision-proxy) stay
 * hand-written classes.
 */
export interface IpcStore<T, SetArgs extends unknown[]> {
  /** Latest value from load()/set(); seeded with `default` until loaded. */
  state: T;
  /** Invoke the load channel once (unless `force`). Idempotent per instance. */
  load(force?: boolean): Promise<void>;
  /** Invoke the set channel; assigns its returned value to `state`. */
  set(...args: SetArgs): Promise<void>;
}

export function createIpcStore<
  LoadCh extends NoArgInvokeChannel,
  SetCh extends InvokeChannel,
>(opts: {
  loadChannel: LoadCh;
  setChannel: SetCh;
  default: InvokeResult<LoadCh>;
}): IpcStore<InvokeResult<LoadCh>, InvokeArgs<SetCh>> {
  let value = $state<InvokeResult<LoadCh>>(opts.default);
  let loaded = false;

  const load = async (force = false): Promise<void> => {
    if (!force && loaded) return;
    loaded = true;
    value = (await api.invoke(opts.loadChannel as NoArgInvokeChannel)) as InvokeResult<LoadCh>;
  };

  const set = async (...args: InvokeArgs<SetCh>): Promise<void> => {
    value = (await api.invoke(opts.setChannel, ...args)) as InvokeResult<LoadCh>;
  };

  return {
    get state() {
      return value;
    },
    load,
    set,
  };
}
