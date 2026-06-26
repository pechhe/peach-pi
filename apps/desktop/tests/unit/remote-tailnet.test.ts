import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveTailnetIp,
  resolveBindAddress,
  isCgnat,
  isRfc1918,
  isValidToken,
  type IfaceAddress,
} from "../../electron/services/served-session/tailnet-bind.ts";

/** Build a fake interface map for the resolver (no live network needed). */
function ifaces(map: Record<string, [string, boolean][]>): () => Record<string, IfaceAddress[]> {
  const out: Record<string, IfaceAddress[]> = {};
  for (const [name, addrs] of Object.entries(map)) {
    out[name] = addrs.map(([address, internal]) => ({
      name,
      address,
      family: "IPv4",
      internal,
    }));
  }
  return () => out;
}

test("resolveTailnetIp finds a CGNAT 100.x address on utun", () => {
  const ip = resolveTailnetIp(
    ifaces({
      en0: [["192.168.1.5", false]],
      utun4: [["100.64.0.10", false]],
    }),
  );
  assert.equal(ip, "100.64.0.10");
});

test("resolveTailnetIp finds CGNAT address even on a non-utun interface name", () => {
  const ip = resolveTailnetIp(
    ifaces({
      eth0: [["100.80.5.5", false]],
    }),
  );
  assert.equal(ip, "100.80.5.5");
});

test("resolveTailnetIp returns null when the tailnet is down (no CGNAT, no tailscale iface)", () => {
  const ip = resolveTailnetIp(
    ifaces({
      en0: [["192.168.1.5", false]],
      lo0: [["127.0.0.1", true]],
    }),
  );
  assert.equal(ip, null);
});

test("resolveTailnetIp skips internal/loopback addresses", () => {
  const ip = resolveTailnetIp(
    ifaces({
      lo0: [["100.64.0.1", true]],
    }),
  );
  assert.equal(ip, null);
});

test("resolveBindAddress returns the tailnet IP when present", () => {
  const r = resolveBindAddress(
    {},
    ifaces({ utun3: [["100.64.1.2", false]] }),
  );
  assert.equal("reject" in r, false);
  if ("bindIp" in r) assert.equal(r.bindIp, "100.64.1.2");
});

test("resolveBindAddress REJECTS (never 0.0.0.0) when no tailnet exists", () => {
  // This is the core security invariant: a missing tailnet must not fall back
  // to listening on all interfaces (ADR-0009). Transcripts cannot be redacted.
  const r = resolveBindAddress(
    {},
    ifaces({ en0: [["192.168.1.5", false]] }),
  );
  assert.equal("reject" in r, true);
  if ("reject" in r) assert.match(r.reject, /tailnet|refusing/i);
});

test("resolveBindAddress refuses an explicit 0.0.0.0 forceBind", () => {
  const r = resolveBindAddress({ forceBind: "0.0.0.0" }, ifaces({}));
  assert.equal("reject" in r, true);
});

test("resolveBindAddress refuses a public IP forceBind", () => {
  const r = resolveBindAddress({ forceBind: "8.8.8.8" }, ifaces({}));
  assert.equal("reject" in r, true);
});

test("resolveBindAddress honors a private RFC1918 forceBind", () => {
  const r = resolveBindAddress({ forceBind: "192.168.1.50" }, ifaces({}));
  assert.equal("bindIp" in r && r.bindIp, "192.168.1.50");
});

test("isCgnat recognizes the 100.64.0.0/10 range", () => {
  assert.ok(isCgnat("100.64.0.1"));
  assert.ok(isCgnat("100.127.255.255"));
  assert.ok(!isCgnat("100.63.255.255"));
  assert.ok(!isCgnat("100.128.0.0"));
  assert.ok(!isCgnat("192.168.0.1"));
});

test("isRfc1918 recognizes private ranges", () => {
  assert.ok(isRfc1918("10.0.0.1"));
  assert.ok(isRfc1918("172.16.0.1"));
  assert.ok(isRfc1918("172.31.255.255"));
  assert.ok(!isRfc1918("172.15.0.1"));
  assert.ok(isRfc1918("192.168.1.1"));
  assert.ok(!isRfc1918("8.8.8.8"));
});

test("isValidToken rejects blank/short/absent tokens", () => {
  assert.ok(!isValidToken(""));
  assert.ok(!isValidToken(null));
  assert.ok(!isValidToken(undefined));
  assert.ok(!isValidToken("short"));
  assert.ok(isValidToken("0123456789abcdef0123456789abcdef"));
});
