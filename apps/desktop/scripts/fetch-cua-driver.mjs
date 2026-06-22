#!/usr/bin/env node
/**
 * Vendor CuaDriver.app for packaging.
 *
 * Downloads the pinned Cua Driver macOS release tarball from GitHub Releases,
 * verifies its sha256 against a baked digest, and extracts `CuaDriver.app`
 * into `build/cua-driver/`. Forge's `extraResource` then copies that into the
 * packaged app's `Contents/Resources/`.
 *
 * We ship the macOS Swift backend as a signed `CuaDriver.app` (identity
 * `com.trycua.driver`) so macOS TCC (Accessibility + Screen Recording) grants
 * attach to the driver bundle and survive Peach Pi updates — see ADR-0007.
 *
 * Idempotent: skips the download when `build/cua-driver/.version` already
 * matches the pinned version. Run manually with `node scripts/fetch-cua-driver.mjs`
 * or let the Forge `prePackage` hook invoke it.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

// ── Pinned release ──────────────────────────────────────────────────────────
// Update all three together when bumping. Digests come from the GitHub release
// asset metadata (`gh api .../releases/tags/cua-driver-v<VERSION>`). The
// universal tarball is identical across arm64/x86_64 and contains a universal
// binary, so one artifact covers both Apple Silicon and Intel.
const VERSION = "0.2.0";
const ASSET = `cua-driver-${VERSION}-darwin-universal.tar.gz`;
const SHA256 = "18c9fb20dcddfe703a55ed99aede4ca3d8fe5aee38afd20c3731acb10f6f4478";
const URL = `https://github.com/trycua/cua/releases/download/cua-driver-v${VERSION}/${ASSET}`;

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEST_DIR = join(__dirname, "..", "build", "cua-driver");
const APP_DEST = join(DEST_DIR, "CuaDriver.app");
const MARKER = join(DEST_DIR, ".version");

function log(msg) {
  process.stdout.write(`[fetch-cua-driver] ${msg}\n`);
}

function alreadyVendored() {
  if (!existsSync(APP_DEST) || !existsSync(MARKER)) return false;
  try {
    return readFileSync(MARKER, "utf8").trim() === VERSION;
  } catch {
    return false;
  }
}

function findApp(dir) {
  for (const name of readdirSync(dir)) {
    if (name === "CuaDriver.app") return join(dir, name);
  }
  return null;
}

async function main() {
  if (alreadyVendored()) {
    log(`CuaDriver.app ${VERSION} already vendored — skipping`);
    return;
  }

  mkdirSync(DEST_DIR, { recursive: true });
  const work = join(tmpdir(), `cua-driver-${VERSION}-${process.pid}`);
  mkdirSync(work, { recursive: true });
  const tarball = join(work, ASSET);

  try {
    log(`downloading ${URL}`);
    const res = await fetch(URL);
    if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());

    const digest = createHash("sha256").update(buf).digest("hex");
    if (digest !== SHA256) {
      throw new Error(`sha256 mismatch\n  expected ${SHA256}\n  got      ${digest}`);
    }
    log(`sha256 ok (${digest})`);
    writeFileSync(tarball, buf);

    log("extracting");
    execFileSync("tar", ["-xzf", tarball, "-C", work]);
    const extracted = findApp(work);
    if (!extracted) throw new Error(`CuaDriver.app not found inside ${ASSET}`);

    if (existsSync(APP_DEST)) rmSync(APP_DEST, { recursive: true, force: true });
    // `ditto` preserves the code signature + bundle structure that TCC relies on.
    execFileSync("ditto", [extracted, APP_DEST]);
    writeFileSync(MARKER, VERSION, "utf8");
    log(`vendored CuaDriver.app ${VERSION} → ${APP_DEST}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

main().catch((err) => {
  process.stderr.write(`[fetch-cua-driver] error: ${err.message ?? err}\n`);
  process.exit(1);
});
