import { networkInterfaces, type NetworkInterfaceInfo } from "node:os";

/** A network interface address considered for binding the relay. */
export interface IfaceAddress {
  name: string;
  address: string;
  /** IPv4 only for v1 (Tailscale hands out 100.x CGNAT addresses). */
  family: "IPv4";
  internal: boolean;
}

/** Resolve the Tailscale interface IP from the host's interfaces.
 *
 * Tailscale assigns addresses in the CGNAT range 100.64.0.0/10 (RFC 6598). We
 * also accept the documented Tailscale ULA range fd7a:115c:a1e0::/48 when IPv6
 * support lands; for v1 only IPv4 is bound. Returns null when the tailnet is
 * down — the caller must NOT fall back to 0.0.0.0 (that would expose the tap
 * off-tailnet). */
export function resolveTailnetIp(
  interfaces: () => Record<string, IfaceAddress[]> = liveInterfaces,
): string | null {
  for (const [name, addrs] of Object.entries(interfaces())) {
    // Tailscale's interface is named "utun*" on macOS, "tailscale0" on Linux.
    const isTs =
      name === "tailscale0" ||
      name === "tailscale" ||
      /^utun\d+$/.test(name) ||
      /^ts/.test(name);
    for (const a of addrs) {
      if (a.family !== "IPv4" || a.internal) continue;
      const cgnat = isCgnat(a.address);
      if (cgnat || (isTs && isRfc1918(a.address))) return a.address;
    }
  }
  return null;
}

/** Is this a 100.64.0.0/10 CGNAT address (Tailscale's IPv4 range)? */
export function isCgnat(ip: string): boolean {
  const seg = ip.split(".");
  const first = Number(seg[0] ?? NaN);
  const second = Number(seg[1] ?? NaN);
  return first === 100 && second >= 64 && second <= 127;
}

/** Is this a private RFC1918 address? */
export function isRfc1918(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  const a = parts[0] ?? NaN;
  const b = parts[1] ?? NaN;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

/**
 * Decide the bind address for the relay. Pure: never returns 0.0.0.0.
 *
 * - When `forceBind` is set and is a private/tailnet IP, honor it.
 * - Otherwise resolve the tailnet IP; if absent, return null (reject — do not
 *   fall back to listening on all interfaces, which would expose source and
 *   secrets off the tailnet).
 *
 * This function is the entire security boundary (transcripts cannot be
 * redacted — see ADR-0009), so bind correctness is a tested invariant.
 */
export function resolveBindAddress(
  config: { forceBind?: string | null },
  interfaces: () => Record<string, IfaceAddress[]> = liveInterfaces,
): { bindIp: string } | { reject: string } {
  if (config.forceBind) {
    if (config.forceBind === "0.0.0.0" || config.forceBind === "::")
      return { reject: "never bind to all interfaces" };
    if (!isRfc1918(config.forceBind) && !isCgnat(config.forceBind))
      return { reject: `refusing to bind public IP ${config.forceBind}` };
    return { bindIp: config.forceBind };
  }
  const ip = resolveTailnetIp(interfaces);
  if (!ip) return { reject: "no Tailscale interface found; refusing to serve off-tailnet" };
  return { bindIp: ip };
}

function liveInterfaces(): Record<string, IfaceAddress[]> {
  const out: Record<string, IfaceAddress[]> = {};
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    if (!addrs) continue;
    out[name] = addrs
      .filter((a): a is NetworkInterfaceInfo => a?.family === "IPv4")
      .map((a) => ({ name, address: a.address, family: "IPv4", internal: a.internal }));
  }
  return out;
}

/** Validate a shared token: must be present and non-trivially long. */
export function isValidToken(token: string | null | undefined): token is string {
  return typeof token === "string" && token.length >= 16;
}
