import { _electron, type ElectronApplication } from "@playwright/test";
import { existsSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const packagedBinary = path.resolve(
  __dirname,
  "../../out/Peach Pi-darwin-arm64/Peach Pi.app/Contents/MacOS/Peach Pi",
);

/** Launch the packaged app with an isolated userData dir. */
export async function launchApp(): Promise<ElectronApplication> {
  if (!existsSync(packagedBinary)) {
    throw new Error(`Packaged app missing — run \`pnpm package\` first (${packagedBinary})`);
  }
  const userData = mkdtempSync(path.join(tmpdir(), "peach-pi-test-"));
  return _electron.launch({
    executablePath: packagedBinary,
    args: [`--user-data-dir=${userData}`],
    env: { ...process.env, PEACH_PI_USER_DATA: userData },
  });
}
