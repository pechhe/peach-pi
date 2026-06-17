/**
 * "Mark Done" animation variant. Persisted to localStorage.
 *
 * DoneBurst reads `doneAnim.current` to decide which burst style to render;
 * DoneBurstPlayground provides the picker and preview.
 */

export type DoneAnimId = "popSpark" | "stamp" | "confetti" | "twos" | "spring";

const STORAGE_KEY = "peachpi:doneAnim";

function load(): DoneAnimId {
  if (typeof localStorage === "undefined") return "popSpark";
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "stamp" || v === "confetti" || v === "twos" || v === "spring" ? v : "popSpark";
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
