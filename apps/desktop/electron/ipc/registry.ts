import { ipcMain, type BrowserWindow } from "electron";
import {
  ipcContracts,
  type EventChannel,
  type EventPayload,
  type InvokeArgs,
  type InvokeChannel,
  type InvokeResult,
} from "@peach-pi/shared-types";
import { captureError, emitDevTapEvent, isDevTapEnabled } from "../services/devtap.ts";

export type IpcHandlers = {
  [K in InvokeChannel]: (...args: InvokeArgs<K>) => InvokeResult<K> | Promise<InvokeResult<K>>;
};

/** Register every invoke contract. Missing handler = compile error. */
export function registerIpcHandlers(handlers: IpcHandlers): void {
  for (const [channel, contract] of Object.entries(ipcContracts)) {
    if (contract.kind !== "invoke") continue;
    const handler = handlers[channel as InvokeChannel] as (...args: unknown[]) => unknown;
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

export function createEmitter(getWindows: () => BrowserWindow[]) {
  return function emit<K extends EventChannel>(channel: K, payload: EventPayload<K>): void {
    for (const win of getWindows()) {
      if (!win.isDestroyed()) win.webContents.send(channel, payload);
    }
  };
}

export type Emit = ReturnType<typeof createEmitter>;
