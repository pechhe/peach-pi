import { contextBridge, ipcRenderer } from "electron";
import { ipcContracts, type PeachPiApi } from "@peach-pi/shared-types";

const invokeChannels = new Set(
  Object.entries(ipcContracts)
    .filter(([, c]) => c.kind === "invoke")
    .map(([name]) => name),
);
const eventChannels = new Set(
  Object.entries(ipcContracts)
    .filter(([, c]) => c.kind === "event")
    .map(([name]) => name),
);

const api: PeachPiApi = {
  invoke: (channel, ...args) => {
    if (!invokeChannels.has(channel)) {
      return Promise.reject(new Error(`Unknown IPC channel: ${channel}`));
    }
    return ipcRenderer.invoke(channel, ...args);
  },
  on: (channel, listener) => {
    if (!eventChannels.has(channel)) {
      throw new Error(`Unknown IPC event channel: ${channel}`);
    }
    const wrapped = (_event: unknown, payload: unknown) => listener(payload as never);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  },
};

contextBridge.exposeInMainWorld("peachPi", api);
