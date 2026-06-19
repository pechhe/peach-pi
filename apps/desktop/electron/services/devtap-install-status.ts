// Detects whether the DevTap runtime tap is installed in a project.
//
// "Installed" = a tap adapter module exists in a conventional location and
// actually defines the tap (contains `emitDevTapEvent`). Cheap, bounded lookup;
// no recursive scan.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { DevTapProjectStatus } from "@peach-pi/shared-types";
import type { AppDb } from "../persistence/db.ts";
import { ProjectRepo } from "../persistence/repositories.ts";

// A file counts as a tap if it defines the Node/Electron tap (emitDevTapEvent)
// or wires the browser/SPA Vite plugin (devtapVite / virtual:devtap-client).
const TAP_MARKER = /emitDevTapEvent|devtapVite|virtual:devtap-client/;
function isTapModule(file: string): boolean {
  try {
    return TAP_MARKER.test(readFileSync(file, "utf8"));
  } catch {
    return false;
  }
}

export class DevTapInstallService {
  private projects: ProjectRepo;

  constructor(db: AppDb) {
    this.projects = new ProjectRepo(db);
  }

  private projectPath(projectId: string): string {
    const project = this.projects.all().find((p) => p.id === projectId);
    if (!project) throw new Error(`Unknown project: ${projectId}`);
    return project.path;
  }

  status(projectId: string): DevTapProjectStatus {
    const root = this.projectPath(projectId);
    const names = ["devtap.ts", "devtap-vite.ts"];
    const dirs = ["", "electron/services", "src"];
    // Vite/SvelteKit configs that may register the browser plugin.
    const configs = ["vite.config.ts", "vite.config.js", "vite.config.mts", "svelte.config.js"];
    const at = (base: string) => [
      ...dirs.flatMap((d) => names.map((n) => join(base, d, n))),
      ...configs.map((c) => join(base, c)),
    ];
    const candidates = at(root);
    // Monorepo: also scan each <root>/apps/* package.
    try {
      for (const app of readdirSync(join(root, "apps"))) candidates.push(...at(join(root, "apps", app)));
    } catch {
      /* no apps/ dir */
    }

    const tapPath = candidates.find((c) => existsSync(c) && isTapModule(c)) ?? null;
    return {
      installed: tapPath !== null,
      tapPath,
      extensionInstalled: existsSync(join(homedir(), ".pi", "agent", "extensions", "devtap")),
    };
  }
}
