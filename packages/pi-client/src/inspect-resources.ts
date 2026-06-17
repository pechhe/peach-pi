import path from "node:path";
import type { ResourceInspection } from "@peach-pi/shared-types";

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

  return {
    skills: skills.map((s) => ({
      name: s.name,
      description: s.description,
      filePath: s.filePath,
      source: s.sourceInfo?.scope ?? "unknown",
    })),
    extensions: [
      ...ext.extensions.map((e) => ({
        path: e.path,
        name: path.basename(e.resolvedPath).replace(/\.(ts|js|mjs|cjs)$/, ""),
        source: e.sourceInfo?.scope ?? "unknown",
        tools: [...e.tools.keys()],
        commands: [...e.commands.keys()],
      })),
      ...ext.errors.map((e) => ({
        path: e.path,
        name: path.basename(e.path),
        source: "error",
        tools: [],
        commands: [],
        error: e.error,
      })),
    ],
    prompts: loader.getPrompts().prompts.map((p) => ({
      name: p.name,
      description: p.description ?? "",
      kind: "prompt" as const,
    })),
  };
}
