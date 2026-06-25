/**
 * "Mark Done" animation variant. Persisted to localStorage.
 *
 * DoneBurst reads `doneAnim.current` to decide which burst style to render;
 * DoneBurstPlayground provides the picker and preview.
 */

export type DoneAnimId =
  | "archiveSlide"
  | "archiveSwipe"
  | "archiveShing"
  | "archiveVacuum"
  | "popSpark"
  | "stamp"
  | "confetti"
  | "twos"
  | "spring";

const STORAGE_KEY = "peachpi:doneAnim";

const VALID: readonly DoneAnimId[] = [
  "archiveSlide",
  "archiveSwipe",
  "archiveShing",
  "archiveVacuum",
  "popSpark",
  "stamp",
  "confetti",
  "twos",
  "spring",
];

function load(): DoneAnimId {
  if (typeof localStorage === "undefined") return "archiveSlide";
  const v = localStorage.getItem(STORAGE_KEY) as DoneAnimId | null;
  return v && VALID.includes(v) ? v : "archiveSlide";
}

class DoneAnimStore {
  current = $state<DoneAnimId>(load());

  set(id: DoneAnimId) {
    this.current = id;
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* quota or ssr */
    }
  }
}

export const doneAnim = new DoneAnimStore();
