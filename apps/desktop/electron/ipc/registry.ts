import { ipcMain, type BrowserWindow } from "electron";
import {
  ipcContracts,
  type EventChannel,
  type EventPayload,
  type InvokeArgs,
  type InvokeChannel,
  type InvokeResult,
  type TypedEmit,
} from "@peach-pi/shared-types";
import { captureError, emitDevTapEvent, isDevTapEnabled } from "../services/devtap.ts";

/** The typed signature every invoke handler must satisfy, per channel. */
export type IpcHandlers = {
  [K in InvokeChannel]: (...args: InvokeArgs<K>) => InvokeResult<K> | Promise<InvokeResult<K>>;
};

/**
 * Declarative pass-throughs: channel → bound method (or bare function) that
 * forwards the invoke args verbatim. Replaces ~90 inline
 * `(id) => service.method(id)` lambdas in main.ts. Entries here are shorthand;
 * the registry loop registers them exactly like a normal handler.
 */
export type IpcForwards = Partial<IpcHandlers>;

/**
 * Register every invoke contract.
 *
 * Splits the handler table two ways so pure pass-throughs can be declared as
 * bound methods without a wrapping lambda:
 *   - `forwards`: shared — channel → `service.method.bind(service)`.
 *   - `handlers`: everything left over (orchestration handlers that call
 *     ≥2 services, capture extra args, or run multi-step logic).
 *
 * Compile-time guarantee: `handlers` must cover exactly the channels not
 * present in `forwards` (`Omit<IpcHandlers, keyof F>`). A missing channel is a
 * type error; a channel present in both is rejected as an excess property.
 */
export function registerIpcHandlers<F extends IpcForwards>(
  forwards: F,
  handlers: Omit<IpcHandlers, keyof F>,
): void {
  const all = { ...forwards, ...handlers } as IpcHandlers;
  for (const [channel, contract] of Object.entries(ipcContracts)) {
    if (contract.kind !== "invoke") continue;
    const handler = all[channel as InvokeChannel] as (...args: unknown[]) => unknown;
    ipcMain.handle(channel, async (_event, ...args: unknown[]) => {
      const validate = (contract as { validate?: (...a: unknown[]) => void }).validate;
      validate?.(...args);
      // Fast path: when DevTap is off, behave exactly as before.
      if (!isDevTapEnabled()) return handler(...args);
      const start = performance.now();
      emitDevTapEvent({ area: "ipc", event: "ipc.handle.start", message: channel, payload: { channel, args } });
      try {
        const result = await handler(...args);
        emitDevTapEvent({
          area: "ipc",
          event: "ipc.handle.success",
          message: channel,
          durationMs: Math.round(performance.now() - start),
          payload: { channel, result },
        });
        return result;
      } catch (err) {
        captureError(err, {
          event: "ipc.handle.error",
          area: "ipc",
          payload: { channel, args, durationMs: Math.round(performance.now() - start) },
        });
        throw err;
      }
    });
  }
}

export function createEmitter(getWindows: () => BrowserWindow[]): TypedEmit {
  return function emit<K extends EventChannel>(channel: K, payload: EventPayload<K>): void {
    for (const win of getWindows()) {
      if (!win.isDestroyed()) win.webContents.send(channel, payload);
    }
  };
}

/** Typed emitter signature (re-exported from shared-types for convenience). */
export type Emit = TypedEmit;
