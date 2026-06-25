import { execFile } from "node:child_process";
import { promisify } from "node:util";
import QRCode from "qrcode";
import type { RemoteConnectInfo, RemoteTailnetPeer } from "@peach-pi/shared-types";

const run = promisify(execFile);

/** Where the watch PWA is hosted. The connect deep link points here; the phone
 *  opens it and folds the query params into a saved master. */
const WATCH_APP_URL = "https://peach-pi-bay.vercel.app";

/** Candidate paths for the Tailscale CLI (GUI app, Homebrew, PATH). */
const TS_BINS = [
  process.env.PEACH_TAILSCALE_BIN,
  "/usr/local/bin/tailscale",
  "/opt/homebrew/bin/tailscale",
  "/Applications/Tailscale.app/Contents/MacOS/Tailscale",
  "tailscale",
].filter((x): x is string => typeof x === "string");

let cachedBin: string | null | undefined;

/** Resolve a working `tailscale` binary once, or null if none responds. */
async function tailscaleBin(): Promise<string | null> {
  if (cachedBin !== undefined) return cachedBin;
  for (const bin of TS_BINS) {
    try {
      await run(bin, ["version"], { timeout: 4000 });
      cachedBin = bin;
      return bin;
    } catch {
      // try the next candidate
    }
  }
  cachedBin = null;
  return null;
}

async function ts(args: string[]): Promise<string | null> {
  const bin = await tailscaleBin();
  if (!bin) return null;
  try {
    const { stdout } = await run(bin, args, { timeout: 8000 });
    return stdout;
  } catch {
    return null;
  }
}

/** Online machines on this device's tailnet (excluding self), each resolved to
 *  its Tailscale Serve HTTPS endpoint so the watcher can attach with just a
 *  passkey. Returns [] when the tailnet / CLI is unavailable. */
export async function listTailnetPeers(): Promise<RemoteTailnetPeer[]> {
  const out = await ts(["status", "--json"]);
  if (!out) return [];
  try {
    const peers = (JSON.parse(out) as {
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

/** This machine's MagicDNS name (no trailing dot), or null if unavailable. */
async function magicDnsName(): Promise<string | null> {
  const out = await ts(["status", "--json"]);
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
async function serveActiveFor(relayPort: number): Promise<boolean> {
  const out = await ts(["serve", "status", "--json"]);
  if (!out) return false;
  try {
    const web = (JSON.parse(out) as { Web?: Record<string, { Handlers?: Record<string, { Proxy?: string }> }> }).Web ?? {};
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
 *  Uses a query string (not a `#` fragment) so QR scanners / iOS can't drop it;
 *  the PWA strips it from the URL right after reading it. */
function connectUrl(name: string, httpsUrl: string, token: string): string {
  const q = new URLSearchParams({ pair: "1", name, host: httpsUrl, token });
  return `${WATCH_APP_URL}/?${q.toString()}`;
}

/** Enable Tailscale Serve so HTTPS on the MagicDNS name proxies to the relay's
 *  loopback listener. Idempotent; throws with a readable message on failure. */
export async function enableServe(relayPort: number): Promise<void> {
  const bin = await tailscaleBin();
  if (!bin) throw new Error("Tailscale CLI not found — is Tailscale installed?");
  await run(bin, ["serve", "--bg", "--https=443", `http://127.0.0.1:${relayPort}`], {
    timeout: 10000,
  });
}

/** Gather everything the UI needs to show the QR / connect link. */
export async function getConnectInfo(opts: {
  token: string;
  relayPort: number;
  enabled: boolean;
}): Promise<RemoteConnectInfo> {
  const serveHint = `tailscale serve --bg --https=443 http://127.0.0.1:${opts.relayPort || 54900}`;
  const dns = await magicDnsName();
  const httpsUrl = dns ? `https://${dns}` : null;
  const serveActive = opts.enabled && opts.relayPort > 0 ? await serveActiveFor(opts.relayPort) : false;

  let url: string | null = null;
  let qrSvg: string | null = null;
  if (opts.enabled && httpsUrl && serveActive) {
    const name = dns!.split(".")[0] || "master";
    url = connectUrl(name, httpsUrl, opts.token);
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
