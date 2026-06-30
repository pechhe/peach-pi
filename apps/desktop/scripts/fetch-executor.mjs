#!/usr/bin/env node
/**
 * Vendor the Executor CLI for packaging.
 *
 * Downloads the pinned Executor macOS release zip from GitHub Releases for the
 * host architecture, verifies its sha256 against a baked digest, and extracts
 * the contents into `build/executor/`. Forge's `extraResource` then copies that
 * dir into the packaged app's `Contents/Resources/executor/`.
 *
 * Executor is the local-first MCP proxy: peach-pi registers
 * `Contents/Resources/executor/executor mcp` as an MCP server (absolute path —
 * a Finder-launched app has no shell PATH). `executor mcp` attaches to an
 * existing local Executor daemon or elects a new owner over the default
 * `~/.executor` data dir, so the user's existing connections appear
 * automatically.
 *
 * The release zip is NOT a bare binary: it holds `executor` plus three
 * FFI-loaded sidecars (`libsql.node`, `keyring.node`, `emscripten-module.wasm`)
 * that must stay co-located, so we ship the whole extracted dir.
 *
 * Idempotent: skips the download when `build/executor/.version` already matches
 * the pinned version+arch. Run manually with `node scripts/fetch-executor.mjs`
 * or let the Forge `prePackage` hook invoke it.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

// ── Pinned release ──────────────────────────────────────────────────────────
// Update VERSION + both digests together when bumping. Digests come from the
// GitHub release asset metadata (`gh api .../releases/tags/v<VERSION>` → each
// asset's `digest` field). Per-arch zips; the host arch is fetched at package
// time (Forge packages for the host arch by default).
const VERSION = "1.5.25";
const SHA256 = {
  arm64: "cdfc62e30c6b452ba9091913c9993e5b0eb0de5ca086b7003d48a07b5fa8a1ce",
  x64: "a41bfab09266840b942b6db0af5248714ec46b1b8ec05d019ed5fd8338cf95f3",
};

const ARCH = process.arch; // "arm64" | "x64"
const expected = SHA256[ARCH];
if (!expected) {
  process.stderr.write(`[fetch-executor] unsupported arch: ${ARCH}\n`);
  process.exit(1);
}
const ASSET = `executor-darwin-${ARCH}.zip`;
const URL = `https://github.com/RhysSullivan/executor/releases/download/v${VERSION}/${ASSET}`;

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEST_DIR = join(__dirname, "..", "build", "executor");
const BIN_DEST = join(DEST_DIR, "executor");
const MARKER = join(DEST_DIR, ".version");
const MARK = `${VERSION}-${ARCH}`;

function log(msg) {
  process.stdout.write(`[fetch-executor] ${msg}\n`);
}

function alreadyVendored() {
  if (!existsSync(BIN_DEST) || !existsSync(MARKER)) return false;
  try {
    return readFileSync(MARKER, "utf8").trim() === MARK;
  } catch {
    return false;
  }
}

async function main() {
  if (alreadyVendored()) {
    log(`Executor ${MARK} already vendored — skipping`);
    return;
  }

  const work = join(tmpdir(), `executor-${MARK}-${process.pid}`);
  mkdirSync(work, { recursive: true });
  const zip = join(work, ASSET);

  try {
    log(`downloading ${URL}`);
    const res = await fetch(URL);
    if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());

    const digest = createHash("sha256").update(buf).digest("hex");
    if (digest !== expected) {
      throw new Error(`sha256 mismatch\n  expected ${expected}\n  got      ${digest}`);
    }
    log(`sha256 ok (${digest})`);
    writeFileSync(zip, buf);

    // Fresh dir each time so a stale binary can never linger.
    if (existsSync(DEST_DIR)) rmSync(DEST_DIR, { recursive: true, force: true });
    mkdirSync(DEST_DIR, { recursive: true });

    log("extracting");
    execFileSync("unzip", ["-o", "-q", zip, "-d", DEST_DIR]);
    if (!existsSync(BIN_DEST)) throw new Error(`executor binary not found inside ${ASSET}`);
    chmodSync(BIN_DEST, 0o755);

    writeFileSync(MARKER, MARK, "utf8");
    log(`vendored Executor ${MARK} → ${DEST_DIR}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

main().catch((err) => {
  process.stderr.write(`[fetch-executor] error: ${err.message ?? err}\n`);
  process.exit(1);
});
