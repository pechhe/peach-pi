import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { satisfies } from "semver";
import type { PiExtensionHealth, PiHealth } from "@peach-pi/shared-types";

/**
 * Startup compatibility check between the pi SDK the app bundles and the pi
 * extensions the user has installed.
 *
 * Why: extensions (pi-subagents etc.) are resolved/built against a specific pi
 * SDK version that lives in the user's agent dir — outside our control. If the
 * bundled host pi drifts from that, tool calls fail with opaque runtime errors
 * (e.g. the `'fg'` crash). We surface a banner instead of crashing silently.
 *
 * A declared peerDependency range is often too loose (e.g. `>=0.79.0`) to catch
 * real breakage between pre-1.0 patch releases, so we also flag a plain version
 * drift between the host and the SDK the extension actually resolved against.
 */

const SDK_PKG = "@earendil-works/pi-coding-agent";

export interface ExtensionFacts {
  id: string;
  resolvedSdk: string | null;
  peerRange: string | null;
}

/** Pure: classify each extension against the bundled host version. */
export function evaluateHealth(hostVersion: string | null, exts: ExtensionFacts[]): PiHealth {
  const extensions: PiExtensionHealth[] = exts.map((e) => {
    let issue: PiExtensionHealth["issue"] = null;
    let level: PiExtensionHealth["level"] = null;
    if (
      hostVersion &&
      e.peerRange &&
      e.peerRange !== "*" &&
      !satisfies(hostVersion, e.peerRange, { includePrerelease: true })
    ) {
      issue = "peer-violation";
      level = "error";
    } else if (hostVersion && e.resolvedSdk && e.resolvedSdk !== hostVersion) {
      issue = "version-drift";
      level = "warning";
    }
    return { ...e, issue, level };
  });
  const status: PiHealth["status"] = extensions.some((e) => e.level === "error")
    ? "error"
    : extensions.some((e) => e.level === "warning")
      ? "warning"
      : "ok";
  const problems = extensions
    .filter((e) => e.issue)
    .map((e) =>
      e.issue === "peer-violation"
        ? `${e.id} requires pi ${e.peerRange}, but the app bundles ${hostVersion}.`
        : `${e.id} was built against pi ${e.resolvedSdk}, but the app bundles ${hostVersion}.`,
    );
  return { hostVersion, status, extensions, problems };
}

function findUp(fromDir: string, relPath: string): string | null {
  let dir = fromDir;
  for (;;) {
    const candidate = path.join(dir, relPath);
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function readJson(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Version of the pi SDK the app actually loads (dev: workspace root; packaged: app.asar). */
function resolveHostPiVersion(fromDir: string): string | null {
  const pkg = findUp(fromDir, `node_modules/${SDK_PKG}/package.json`);
  return pkg ? ((readJson(pkg)?.version as string | undefined) ?? null) : null;
}

/** Map a pi `packages[]` entry to its install dir under the agent dir. */
function extensionDir(agentDir: string, id: string): string | null {
  if (id.startsWith("git:")) return path.join(agentDir, "git", id.slice(4));
  if (id.startsWith("npm:")) return path.join(agentDir, "node_modules", id.slice(4));
  return null;
}

/** Discover the SDK version + peer range an installed extension resolved. */
function inspectExtension(agentDir: string, id: string): ExtensionFacts {
  const dir = extensionDir(agentDir, id);
  if (!dir) return { id, resolvedSdk: null, peerRange: null };
  const pkg = readJson(path.join(dir, "package.json"));
  const peer = pkg?.peerDependencies as Record<string, string> | undefined;
  const peerRange = peer?.[SDK_PKG] ?? null;
  // Only a *nested* SDK copy is a reliable "built against" signal — it means the
  // extension pinned a specific host version (the pi-subagents case that broke).
  // The shared agent-dir install is ignored: most extensions use the injected
  // host API rather than a direct SDK import, so it produces false drifts.
  const nested = readJson(path.join(dir, "node_modules", SDK_PKG, "package.json"));
  const resolvedSdk = (nested?.version as string | undefined) ?? null;
  return { id, resolvedSdk, peerRange };
}

export async function computePiHealth(fromDir: string): Promise<PiHealth> {
  let agentDir: string;
  try {
    const sdk = (await import(SDK_PKG)) as { getAgentDir: () => string };
    agentDir = sdk.getAgentDir();
  } catch {
    agentDir = path.join(homedir(), ".pi", "agent");
  }
  const hostVersion = resolveHostPiVersion(fromDir);
  const settings = readJson(path.join(agentDir, "settings.json"));
  const ids = Array.isArray(settings?.packages) ? (settings.packages as string[]) : [];
  const exts = ids.map((id) => inspectExtension(agentDir, id));
  return evaluateHealth(hostVersion, exts);
}
