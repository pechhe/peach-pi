/** Master sound switch, persisted to localStorage. Checked by all play* entry points. */
const KEY = "peachpi:sounds-muted";
/** Which "done" chime plays when a thread finishes. Validated by done-sound.ts. */
const VARIANT_KEY = "peachpi:done-sound-variant";
const DEFAULT_VARIANT = "arpeggio";
/** Which cue plays when the user marks a thread done (archives it). */
const ARCHIVE_VARIANT_KEY = "peachpi:archive-sound-variant";
const DEFAULT_ARCHIVE_VARIANT = "archive";

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

export function getArchiveSoundVariant(): string {
  try {
    return localStorage.getItem(ARCHIVE_VARIANT_KEY) ?? DEFAULT_ARCHIVE_VARIANT;
  } catch {
    return DEFAULT_ARCHIVE_VARIANT;
  }
}

export function setArchiveSoundVariant(variant: string): void {
  try {
    localStorage.setItem(ARCHIVE_VARIANT_KEY, variant);
  } catch {
    /* ignore */
  }
}
