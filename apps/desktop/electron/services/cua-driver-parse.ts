import type { PermissionState } from "@peach-pi/shared-types";

/** Parse a `cua-driver permissions status` line for one permission. */
export function parsePermission(text: string, label: string): PermissionState {
  const line = text.split("\n").find((l) => l.includes(label));
  if (!line) return "unknown";
  if (/✅|granted/i.test(line)) return "granted";
  if (/❌|denied|not granted/i.test(line)) return "denied";
  return "unknown";
}

/** Extract the version from `cua-driver --version`. v0.2.0 prints a bare
 *  semver ("0.2.0"); newer builds prefix it ("cua-driver 0.5.1"). */
export function parseVersion(text: string): string | null {
  const m = text.match(/(?:cua-driver\s+)?v?(\d+\.\d+\.\d+[^\s]*)/i);
  return m?.[1] ?? null;
}

/** True when `cua-driver status` reports the daemon is up. */
export function parseDaemonRunning(text: string): boolean {
  return !/not running/i.test(text) && /running/i.test(text);
}
