/**
 * Factories for the renderer preference stores. Each store persists a single
 * JSON value to localStorage under a fixed key and keeps every open window in
 * sync via the `storage` event. Before this module existed, `command-prefs`,
 * `model-prefs`, and `usage-prefs` each carried byte-identical `readArray` /
 * `writeArray` (and `readMap` / `writeMap`) copies of the logic below.
 *
 * The factories are intentionally dumb: they own only the localStorage read /
 * write and the per-key `storage` listener. Callers own their `$state` and any
 * bespoke defaulting / validation, so this stays free of Svelte runes and can
 * live in a plain `.ts` module.
 */

export interface ArrayPref {
  /**
   * Read and validate the stored array. Returns `[]` when the key is missing,
   * holds non-array JSON, or throws on parse — matching the prior per-store
   * `readArray` helpers byte-for-byte.
   */
  read(): string[];
  /**
   * Persist an array as JSON, swallowing quota / serialization errors, matching
   * the prior per-store `writeArray` helpers.
   */
  write(value: string[]): void;
  /**
   * Register a `storage` listener scoped to this key. `cb` runs only when this
   * key changes in another window; it receives the event so callers that need
   * the raw `newValue` (e.g. to skip clears) can branch on it.
   */
  sync(cb: (e: StorageEvent) => void): void;
}

export interface MapPref {
  /**
   * Read and validate the stored object. Returns `{}` when the key is missing,
   * holds a non-plain-object (including arrays), or throws on parse — matching
   * the prior per-store `readMap` helpers byte-for-byte.
   */
  read<T>(): Record<string, T>;
  /** Persist an object as JSON, swallowing quota / serialization errors. */
  write<T>(value: Record<string, T>): void;
  /** Register a `storage` listener scoped to this key. See {@link ArrayPref.sync}. */
  sync(cb: (e: StorageEvent) => void): void;
}

export function arrayPref(key: string): ArrayPref {
  const read = (): string[] => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((v): v is string => typeof v === "string")
        : [];
    } catch {
      return [];
    }
  };

  const write = (value: string[]): void => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  };

  const sync = (cb: (e: StorageEvent) => void): void => {
    window.addEventListener("storage", (e) => {
      if (e.key === key) cb(e);
    });
  };

  return { read, write, sync };
}

export function mapPref(key: string): MapPref {
  const read = <T>(): Record<string, T> => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, T>)
        : {};
    } catch {
      return {};
    }
  };

  const write = <T>(value: Record<string, T>): void => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  };

  const sync = (cb: (e: StorageEvent) => void): void => {
    window.addEventListener("storage", (e) => {
      if (e.key === key) cb(e);
    });
  };

  return { read, write, sync };
}
