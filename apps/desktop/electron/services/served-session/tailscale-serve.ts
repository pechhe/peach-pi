import { execFile } from "node:child_process";
import { promisify } from "node:util";
import QRCode from "qrcode";
import type {
  RemoteConnectInfo,
  RemoteTailnetPeer,
  TransportAdapter,
  IfaceAddress,
} from "@peach-pi/shared-types";
import { resolveBindAddress } from "./tailnet-bind.ts";

const run = promisify(execFile);

/** Default hosted location for the watch PWA. The connect deep link points
 *  here; the phone opens it and folds the query params into a saved master.
 *  Adapter config — a future mesh adapter would carry its own. */
const DEFAULT_WATCH_APP_URL = "https://peach-pi-bay.vercel.app";

/** Default candidate paths for the Tailscale CLI (GUI app, Homebrew, PATH). */
const DEFAULT_TS_BINS = [
  process.env.PEACH_TAILSCALE_BIN,
  "/usr/local/bin/tailscale",
  "/opt/homebrew/bin/tailscale",
  "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
  "tailscale",
].filter((x): x is string => typeof x === "string");

/** Configuration for the Tailscale transport adapter. v1 has one
 *  implementation; the config object carries the mesh-specific constants
 *  (`WATCH_APP_URL` + `TS_BINS`) so they are adapter config, not cluster
 *  constants (ADR-0012). */
export interface TailscaleAdapterConfig {
  /** Where the watch PWA is hosted (deep-link base). */
  watchAppUrl?: string;
  /** Candidate `tailscale` binary paths (first to respond wins). */
  tsBins?: string[];
}

/**
 * Tailscale transport adapter (ADR-0012) — the single v1 implementation of
 * `TransportAdapter`. Fronts the served-session relay's loopback listener with
 * Tailscale Serve HTTPS, resolves the mesh bind address (pure, delegated to
 * `tailnet-bind.ts`), and gathers connect info / peers via the `tailscale` CLI.
 *
 * The interface exists to localize the Tailscale coupling; a second mesh
 * adapter (ZeroTier/WireGuard) is YAGNI for v1 (ADR-0009: mesh + bearer token
 * are the entire security boundary; swapping the mesh changes the security
 * argument). One implementation.
 */
export class TailscaleTransportAdapter implements TransportAdapter {
  private readonly watchAppUrl: string;
  private readonly tsBins: string[];
  private cachedBin: string | null | undefined;

  constructor(config: TailscaleAdapterConfig = {}) {
    this.watchAppUrl = config.watchAppUrl ?? DEFAULT_WATCH_APP_URL;
    this.tsBins = config.tsBins ?? DEFAULT_TS_BINS;
  }

  /** Resolve the mesh-local address the relay must bind to (never 0.0.0.0).
   *  Pure — delegated to `tailnet-bind.resolveBindAddress` so bind correctness
   *  stays a tested invariant independent of the CLI. */
  resolveBindAddress(
    config: { forceBind?: string | null },
    interfaces?: () => Record<string, IfaceAddress[]>,
  ): { bindIp: string } | { reject: string } {
    return resolveBindAddress(config, interfaces);
  }

  /** Resolve a working `tailscale` binary once, or null if none responds. */
  private async tailscaleBin(): Promise<string | null> {
    if (this.cachedBin !== undefined) return this.cachedBin;
    for (const bin of this.tsBins) {
      try {
        await run(bin, ["version"], { timeout: 4000 });
        this.cachedBin = bin;
        return bin;
      } catch {
        // try the next candidate
      }
    }
    this.cachedBin = null;
    return null;
  }

  private async ts(args: string[]): Promise<string | null> {
    const bin = await this.tailscaleBin();
    if (!bin) return null;
    try {
      const { stdout } = await run(bin, args, { timeout: 8000 });
      return stdout;
    } catch {
      return null;
    }
  }

  /** Online machines on this device's tailnet (excluding self), each resolved
   *  to its Tailscale Serve HTTPS endpoint so the watcher can attach with just
   *  a passkey. Returns [] when the tailnet / CLI is unavailable. */
  listPeers(): Promise<RemoteTailnetPeer[]> {
    return listTailnetPeers(this.ts.bind(this));
  }

  /** This machine's MagicDNS name (no trailing dot), or null if unavailable. */
  private async magicDnsName(): Promise<string | null> {
    const out = await this.ts(["status", "--json"]);
    if (!out) return null;
    try {
      const self = (JSON.parse(out) as { Self?: { DNSName?: string } }).Self;
      const dns = self?.DNSName?.replace(/\.$/, "") ?? "";
      return dns || null;
    } catch {
      return null;
    }
  }

  /** True when `tailscale serve` is proxying HTTPS to our relay's loopback port. */
  async serveActiveFor(relayPort: number): Promise<boolean> {
    const out = await this.ts(["serve", "status", "--json"]);
    if (!out) return false;
    try {
      const web =
        (JSON.parse(out) as {
          Web?: Record<string, { Handlers?: Record<string, { Proxy?: string }> }>;
        }).Web ?? {};
      for (const site of Object.values(web)) {
        for (const handler of Object.values(site.Handlers ?? {})) {
          if (handler.Proxy?.includes(`:${relayPort}`)) return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  /** Build the deep link that opens the watch app pre-filled with this master.
   *  Uses a query string (not a `#` fragment) so QR scanners / iOS can't drop
   *  it; the PWA strips it from the URL right after reading it. */
  private connectUrl(name: string, httpsUrl: string, token: string): string {
    const q = new URLSearchParams({ pair: "1", name, host: httpsUrl, token });
    return `${this.watchAppUrl}/?${q.toString()}`;
  }

  /** Enable Tailscale Serve so HTTPS on the MagicDNS name proxies to the
   *  relay's loopback listener. Idempotent; throws with a readable message on
   *  failure. */
  async enableServe(relayPort: number): Promise<void> {
    const bin = await this.tailscaleBin();
    if (!bin) throw new Error("Tailscale CLI not found — is Tailscale installed?");
    await run(bin, ["serve", "--bg", "--https=443", `http://127.0.0.1:${relayPort}`], {
      timeout: 10000,
    });
  }

  /** Gather everything the UI needs to show the QR / connect link. */
  async getConnectInfo(opts: {
    token: string;
    relayPort: number;
    enabled: boolean;
  }): Promise<RemoteConnectInfo> {
    const serveHint = `tailscale serve --bg --https=443 http://127.0.0.1:${opts.relayPort || 54900}`;
    const dns = await this.magicDnsName();
    const httpsUrl = dns ? `https://${dns}` : null;
    const serveActive =
      opts.enabled && opts.relayPort > 0 ? await this.serveActiveFor(opts.relayPort) : false;

    let url: string | null = null;
    let qrSvg: string | null = null;
    if (opts.enabled && httpsUrl && serveActive) {
      const name = dns!.split(".")[0] || "master";
      url = this.connectUrl(name, httpsUrl, opts.token);
      qrSvg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
    }

    return {
      magicDnsName: dns,
      httpsUrl,
      serveActive,
      connectUrl: url,
      qrSvg,
      serveHint,
    };
  }
}

/** Default adapter instance used by main.ts wiring. Constructed once; the IPC
 *  handlers that previously imported the bare `getConnectInfo` / `enableServe`
 *  functions now go through this instance. (ADR-0012: one implementation —
 *  Tailscale.) */
const defaultAdapter = new TailscaleTransportAdapter();

/** Front the relay with Tailscale Serve HTTPS on the MagicDNS name. */
export function enableServe(relayPort: number): Promise<void> {
  return defaultAdapter.enableServe(relayPort);
}

/** Online tailnet peers via the default adapter (the IPC handler surfaces
 *  these directly). */
export function listTailnetPeersDefault(): Promise<RemoteTailnetPeer[]> {
  return defaultAdapter.listPeers();
}

/** Gather everything the UI needs to show the QR / connect link. */
export function getConnectInfo(opts: {
  token: string;
  relayPort: number;
  enabled: boolean;
}): Promise<RemoteConnectInfo> {
  return defaultAdapter.getConnectInfo(opts);
}

/** Online machines on this device's tailnet (excluding self), each resolved to
 *  its Tailscale Serve HTTPS endpoint so the watcher can attach with just a
 *  passkey. Returns [] when the tailnet / CLI is unavailable.
 *
 *  Free function over an injected `ts` runner so it stays pure-testable without
 *  a constructed adapter; the adapter delegates to it. Kept for the IPC handler
 *  that surfaces peers directly. */
export async function listTailnetPeers(
  ts: (args: string[]) => Promise<string | null>,
): Promise<RemoteTailnetPeer[]> {
  const out = await ts(["status", "--json"]);
  if (!out) return [];
  try {
    const peers =
      (JSON.parse(out) as {
        Peer?: Record<string, { DNSName?: string; Online?: boolean }>;
      }).Peer ?? {};
    return Object.values(peers)
      .map((p) => {
        const dns = p.DNSName?.replace(/\.$/, "") ?? "";
        if (!dns) return null;
        return {
          name: dns.split(".")[0] || dns,
          magicDnsName: dns,
          httpsUrl: `https://${dns}`,
          online: p.Online === true,
        } satisfies RemoteTailnetPeer;
      })
      .filter((p): p is RemoteTailnetPeer => p !== null)
      .sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}
