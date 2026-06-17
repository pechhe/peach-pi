/** Master sound switch, persisted to localStorage. Checked by all play* entry points. */
const KEY = "peachpi:sounds-muted";
/** Which "done" chime plays when a thread finishes. Validated by done-sound.ts. */
const VARIANT_KEY = "peachpi:done-sound-variant";
const DEFAULT_VARIANT = "arpeggio";

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

export function getDoneSoundVariant(): string {
  try {
    return localStorage.getItem(VARIANT_KEY) ?? DEFAULT_VARIANT;
  } catch {
    return DEFAULT_VARIANT;
  }
}

export function setDoneSoundVariant(variant: string): void {
  try {
    localStorage.setItem(VARIANT_KEY, variant);
  } catch {
    /* ignore */
  }
}
