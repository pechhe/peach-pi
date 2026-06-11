import { ipcMain, type BrowserWindow } from "electron";
import {
  ipcContracts,
  type EventChannel,
  type EventPayload,
  type InvokeArgs,
  type InvokeChannel,
  type InvokeResult,
} from "@peach-pi/shared-types";

export type IpcHandlers = {
  [K in InvokeChannel]: (...args: InvokeArgs<K>) => InvokeResult<K> | Promise<InvokeResult<K>>;
};

/** Register every invoke contract. Missing handler = compile error. */
export function registerIpcHandlers(handlers: IpcHandlers): void {
  for (const [channel, contract] of Object.entries(ipcContracts)) {
    if (contract.kind !== "invoke") continue;
    const handler = handlers[channel as InvokeChannel] as (...args: unknown[]) => unknown;
    ipcMain.handle(channel, (_event, ...args: unknown[]) => {
      const validate = (contract as { validate?: (...a: unknown[]) => void }).validate;
      validate?.(...args);
      return handler(...args);
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
