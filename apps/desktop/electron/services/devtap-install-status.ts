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

function isTapModule(file: string): boolean {
  try {
    return readFileSync(file, "utf8").includes("emitDevTapEvent");
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
    const candidates = [
      join(root, "electron", "services", "devtap.ts"),
      join(root, "src", "devtap.ts"),
    ];
    // Monorepo: <root>/apps/*/{electron/services,src}/devtap.ts
    try {
      for (const app of readdirSync(join(root, "apps"))) {
        candidates.push(join(root, "apps", app, "electron", "services", "devtap.ts"));
        candidates.push(join(root, "apps", app, "src", "devtap.ts"));
      }
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
