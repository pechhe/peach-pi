/** Master sound switch, persisted to localStorage. Checked by all play* entry points. */
const KEY = "peachpi:sounds-muted";

export function soundsMuted(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setSoundsMuted(muted: boolean): void {
  try {
    localStorage.setItem(KEY, muted ? "1" : "0");
  } catch {
    /* ignore */
  }
}
