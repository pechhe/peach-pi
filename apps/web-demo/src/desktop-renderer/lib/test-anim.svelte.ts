/**
 * "Mark to test" animation variant. Separate from Done (done-anim.svelte.ts)
 * because the semantics differ: this marks a thread for a test bench, not
 * completion, so it has its own fixed cue (not part of the Done picker).
 *
 * Fixed id `testBench` — played on the row when the Eye/"Mark to test"
 * action is pressed. Previews live in TestBurstPlayground.
 */

const STORAGE_KEY = "peachpi:testAnim";

// Single fixed variant for now. Kept as a store (mirrors done-anim) so the
// preview playground can replay it and so we can add variants later without
// touching the Sidebar wiring.
export type TestAnimId = "testBench";

const VALID: readonly TestAnimId[] = ["testBench"];

function load(): TestAnimId {
  if (typeof localStorage === "undefined") return "testBench";
  const v = localStorage.getItem(STORAGE_KEY) as TestAnimId | null;
  return v && VALID.includes(v) ? v : "testBench";
}

class TestAnimStore {
  current = $state<TestAnimId>(load());

  set(id: TestAnimId) {
    this.current = id;
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* quota or ssr */
    }
  }
}

export const testAnim = new TestAnimStore();
