import path from "node:path";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import type { ResourceInspection } from "@peach-pi/shared-types";

/** The peach-managed stash of disabled extension specs/paths. We move entries
 *  here from `packages`/`extensions` so pi stops loading them; restoring moves
 *  them back. Read alongside inspection to flag `disabled` on each extension. */
async function readDisabledExtensions(): Promise<Set<string>> {
  try {
    const raw = await readFile(
      path.join(homedir(), ".pi", "agent", "settings.json"),
      "utf8",
    );
    const parsed = JSON.parse(raw) as { peachDisabledExtensions?: string[] };
    return new Set(parsed.peachDisabledExtensions ?? []);
  } catch {
    return new Set();
  }
}

/**
 * Session-free resource inspection for a cwd: skills, extensions (with load
 * errors), and prompt templates. Powers the Skills/Extensions views.
 */
export async function inspectResources(cwd: string): Promise<ResourceInspection> {
  // Dynamic import: see pi-session.ts — SDK is ESM-only, main bundle is CJS.
  const { DefaultResourceLoader, getAgentDir } = await import("@earendil-works/pi-coding-agent");
  const loader = new DefaultResourceLoader({ cwd, agentDir: getAgentDir() });
  await loader.reload();

  const { skills } = loader.getSkills();
  const ext = loader.getExtensions();

  // Display name: the file basename works for single-file extensions
  // (chassis-reminder.ts), but package/dir extensions resolve to an entry file
  // (index.ts) whose basename is useless. Fall back to the package dir name
  // (sourceInfo.baseDir) for installed packages, else the containing folder.
  const extName = (e: (typeof ext.extensions)[number]): string => {
    const base = path.basename(e.resolvedPath).replace(/\.(ts|js|mjs|cjs)$/, "");
    if (base !== "index") return base;
    const dir = e.sourceInfo?.origin === "package" && e.sourceInfo.baseDir
      ? e.sourceInfo.baseDir
      : path.dirname(e.resolvedPath);
    return path.basename(dir);
  };

  // A package can register from multiple entry files (e.g. tools/index.ts +
  // commands/index.ts) — collapse those into one card keyed by the package dir.
  // For a local extension, the on-disk thing to delete: the single file
  // (snake.ts) or the extension folder (dayjob-metabase/), i.e. the first path
  // segment under its `extensions` dir. Null for packages (use removeSpec).
  const localDeletePath = (e: (typeof ext.extensions)[number]): string | null => {
    const base = e.sourceInfo?.baseDir;
    if (!base) return null;
    const extDir = path.join(base, "extensions");
    const rel = path.relative(extDir, e.resolvedPath);
    if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
    const first = rel.split(path.sep)[0];
    return first ? path.join(extDir, first) : null;
  };

  const merged = new Map<
    string,
    {
      path: string;
      name: string;
      source: string;
      removeSpec: string | null;
      deletePath: string | null;
      tools: Set<string>;
      commands: Set<string>;
    }
  >();
  for (const e of ext.extensions) {
    const isPackage = e.sourceInfo?.origin === "package";
    const key = isPackage && e.sourceInfo.baseDir ? e.sourceInfo.baseDir : e.resolvedPath;
    const entry = merged.get(key) ?? {
      path: e.path,
      name: extName(e),
      source: e.sourceInfo?.scope ?? "unknown",
      // Only installed packages carry an `npm:`/`git:` spec that `pi remove`
      // accepts; local single-file extensions are plain files, not packages.
      removeSpec: isPackage ? (e.sourceInfo?.source ?? null) : null,
      deletePath: isPackage ? null : localDeletePath(e),
      tools: new Set<string>(),
      commands: new Set<string>(),
    };
    for (const t of e.tools.keys()) entry.tools.add(t);
    for (const c of e.commands.keys()) entry.commands.add(c);
    merged.set(key, entry);
  }

  // On-disk thing to delete for a local skill: the skill directory (when the
  // file is SKILL.md) or the single .md file (loose file). Null for packaged
  // skills (manage via `pi remove`) or anything not directly under `skills`.
  const skillDeletePath = (s: (typeof skills)[number]): string | null => {
    if (s.sourceInfo?.origin === "package") return null;
    const target = path.basename(s.filePath) === "SKILL.md" ? s.baseDir : s.filePath;
    const extDir = path.dirname(target);
    if (path.basename(extDir) !== "skills") return null;
    const rel = path.relative(extDir, target);
    if (rel.startsWith("..") || path.isAbsolute(rel) || rel === "") return null;
    return target;
  };

  const disabledExtensions = await readDisabledExtensions();

  return {
    skills: skills.map((s) => ({
      name: s.name,
      description: s.description,
      filePath: s.filePath,
      source: s.sourceInfo?.scope ?? "unknown",
      deletePath: skillDeletePath(s),
      disableModelInvocation: s.disableModelInvocation,
    })),
    extensions: [
      ...[...merged.values()].map((e) => ({
        path: e.path,
        name: e.name,
        source: e.source,
        removeSpec: e.removeSpec,
        deletePath: e.deletePath,
        tools: [...e.tools],
        commands: [...e.commands],
        // Packages key on removeSpec (the npm:/git: spec); local extensions
        // key on their path.
        disabled: disabledExtensions.has(e.removeSpec ?? e.path),
      })),
      ...ext.errors.map((e) => ({
        path: e.path,
        name: path.basename(e.path),
        source: "error",
        tools: [],
        commands: [],
        removeSpec: null,
        deletePath: null,
        error: e.error,
        disabled: false,
      })),
    ],
    prompts: loader.getPrompts().prompts.map((p) => ({
      name: p.name,
      description: p.description ?? "",
      kind: "prompt" as const,
    })),
  };
}
