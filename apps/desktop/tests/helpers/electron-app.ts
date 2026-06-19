import { _electron, type ElectronApplication } from "@playwright/test";
import { existsSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const packagedBinary = path.resolve(
  __dirname,
  "../../out/Peach Pi-darwin-arm64/Peach Pi.app/Contents/MacOS/Peach Pi",
);

/** A fresh isolated userData dir (reusable across relaunches in one test). */
export function makeUserData(): string {
  // Space in the dir name mirrors production ("~/Library/Application Support/
  // Peach Pi") so path-quoting bugs surface in tests instead of only at runtime.
  return mkdtempSync(path.join(tmpdir(), "peach pi-test-"));
}

/** Launch the packaged app with an isolated userData dir. Pass a dir to reuse one. */
export async function launchApp(userData = makeUserData()): Promise<ElectronApplication> {
  if (!existsSync(packagedBinary)) {
    throw new Error(`Packaged app missing — run \`pnpm package\` first (${packagedBinary})`);
  }
  return _electron.launch({
    executablePath: packagedBinary,
    args: [`--user-data-dir=${userData}`],
    env: { ...process.env, PEACH_PI_USER_DATA: userData },
  });
}
