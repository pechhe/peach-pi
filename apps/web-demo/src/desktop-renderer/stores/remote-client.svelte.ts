import { api } from "../lib/ipc";

/** This machine's stable remote-client identity (ADR-0011). Fetched once;
 *  used by ThreadView to decide "You're in control" vs "Controlled by <X>". */
class RemoteClientStore {
  id = $state<string | null>(null);
  name = $state<string | null>(null);
  private loaded = false;

  init(): void {
    if (this.loaded) return;
    this.loaded = true;
    void api.invoke("app:getRemoteClientId").then((c) => {
      this.id = c.id;
      this.name = c.name;
    });
  }
}

export const remoteClient = new RemoteClientStore();
