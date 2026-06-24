import { stat } from "node:fs/promises";

/** Does a path exist? Non-throwing, like `fs.existsSync` but async. */
export async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}
