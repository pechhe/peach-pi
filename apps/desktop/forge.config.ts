import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type { ForgeConfig } from "@electron-forge/shared-types";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { MakerZIP } from "@electron-forge/maker-zip";
import { MakerDMG } from "@electron-forge/maker-dmg";
import { PublisherS3 } from "@electron-forge/publisher-s3";

/**
 * Vendor the pi SDK dependency tree into the packaged app.
 *
 * The SDK is external to the Vite main bundle (it loads extensions and
 * resources from disk at runtime), and electron-packager does not copy
 * pnpm-hoisted workspace-root node_modules. So after Forge copies the app
 * source, walk the SDK's production dependency closure and copy each package
 * into the build dir's node_modules. Missing optional platform packages
 * (e.g. linux clipboard prebuilds) are skipped.
 */
function vendorPiSdk(buildPath: string): void {
  const resolved = new Map<string, string>();

  const findPkg = (name: string, fromDir: string): string | null => {
    let dir = fromDir;
    for (;;) {
      const candidate = path.join(dir, "node_modules", name);
      if (fs.existsSync(path.join(candidate, "package.json"))) return candidate;
      const parent = path.dirname(dir);
      if (parent === dir) return null;
      dir = parent;
    }
  };

  const visit = (name: string, fromDir: string, optional: boolean): void => {
    if (resolved.has(name)) return;
    const dir = findPkg(name, fromDir);
    if (!dir) {
      if (optional) return;
      throw new Error(`vendorPiSdk: cannot resolve required dependency ${name}`);
    }
    resolved.set(name, dir);
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };
    for (const dep of Object.keys(pkg.dependencies ?? {})) visit(dep, dir, false);
    for (const dep of Object.keys(pkg.optionalDependencies ?? {})) visit(dep, dir, true);
  };

  visit("@earendil-works/pi-coding-agent", __dirname, false);
  visit("node-pty", __dirname, false); // native PTY for the integrated terminal

  for (const [name, src] of resolved) {
    const dest = path.join(buildPath, "node_modules", name);
    fs.cpSync(src, dest, { recursive: true, dereference: true });
  }
  // npm tarball ships spawn-helper without the exec bit.
  const helper = path.join(
    buildPath,
    `node_modules/node-pty/prebuilds/${process.platform}-${process.arch}/spawn-helper`,
  );
  if (fs.existsSync(helper)) fs.chmodSync(helper, 0o755);
  console.log(`vendorPiSdk: copied ${resolved.size} packages into ${buildPath}`);
}

const config: ForgeConfig = {
  // Skip electron-rebuild: every native dep (node-pty, clipboard, pi-tui)
  // ships ABI-stable N-API prebuilds. Rebuilding node-pty actually breaks it:
  // it emits build/Release/pty.node WITHOUT spawn-helper, shadowing the
  // complete prebuilds dir (loader prefers build/Release).
  rebuildConfig: { onlyModules: [] },
  packagerConfig: {
    appBundleId: "com.peach-pi.desktop",
    icon: path.join(__dirname, "build/icon"), // .icns appended per-platform by packager
    // Ship the bundled CuaDriver.app (vendored by the prePackage hook) into
    // Contents/Resources so CuaDriverService can install + drive it (ADR-0007).
    // Ship the Executor CLI dir (binary + FFI sidecars) into
    // Contents/Resources/executor so McpService can register `executor mcp`.
    extraResource: [
      path.join(__dirname, "build/cua-driver/CuaDriver.app"),
      path.join(__dirname, "build/executor"),
      // Native notch helper (ADR-0016), built by the prePackage hook. Lands at
      // Contents/Resources/notch-helper where NotchService spawns it.
      path.join(__dirname, "native/notch/.build/release/notch-helper"),
    ],
    // Native N-API prebuilds (clipboard, pi-tui) must live outside the asar.
    // node-pty's prebuilds dir also holds the spawn-helper executable.
    asar: { unpack: "{**/*.node,**/node-pty/prebuilds/**}" },
    // Signing/notarization activate when credentials are present in the env
    // (CI release lane); local/dev packaging stays unsigned.
    ...(process.env.PEACH_PI_SIGN_IDENTITY
      ? { osxSign: { identity: process.env.PEACH_PI_SIGN_IDENTITY } }
      : {}),
    ...(process.env.APPLE_ID && process.env.APPLE_ID_PASSWORD && process.env.APPLE_TEAM_ID
      ? {
          osxNotarize: {
            appleId: process.env.APPLE_ID,
            appleIdPassword: process.env.APPLE_ID_PASSWORD,
            teamId: process.env.APPLE_TEAM_ID,
          },
        }
      : {}),
  },
  hooks: {
    // Vendor CuaDriver.app before packaging so `extraResource` can copy it.
    // Idempotent + pinned + checksum-verified (see scripts/fetch-cua-driver.mjs).
    prePackage: async () => {
      execFileSync(process.execPath, [path.join(__dirname, "scripts/fetch-cua-driver.mjs")], {
        stdio: "inherit",
      });
      execFileSync(process.execPath, [path.join(__dirname, "scripts/fetch-executor.mjs")], {
        stdio: "inherit",
      });
      // Build the native notch helper (ADR-0016) so extraResource can copy it.
      execFileSync("bash", [path.join(__dirname, "native/notch/build.sh")], {
        stdio: "inherit",
      });
    },
    packageAfterCopy: async (_config, buildPath) => {
      vendorPiSdk(buildPath);
      // Stage peach-owned pi extensions (e.g. peach-connectors) into the
      // packaged app source tree so ensureConnectorExtension() can copy them
      // to ~/.pi/agent/extensions/ on first launch. See ADR-0011.
      execFileSync(
        process.execPath,
        [path.join(__dirname, "../../scripts/build-extensions.mjs"), "--out", path.join(buildPath, "electron/build/extensions")],
        { stdio: "inherit" },
      );
    },
  },
  makers: [
    new MakerZIP(
      // When PEACH_PI_UPDATE_URL is set (release lane), the ZIP maker also
      // emits the Squirrel.Mac RELEASES.json manifest. DMG-only builds cannot
      // auto-update. Inert for dev/unsigned builds.
      process.env.PEACH_PI_UPDATE_URL
        ? { macUpdateManifestBaseUrl: process.env.PEACH_PI_UPDATE_URL }
        : {},
      ["darwin"],
    ),
    new MakerDMG({}, ["darwin"]),
  ],
  ...(process.env.PEACH_PI_UPDATE_URL &&
    process.env.PEACH_PI_R2_BUCKET &&
    process.env.PEACH_PI_R2_ACCESS_KEY_ID &&
    process.env.PEACH_PI_R2_SECRET_ACCESS_KEY
    ? {
        publishers: [
          new PublisherS3({
            // S3-compatible object storage. Works with AWS S3, Cloudflare R2
            // (set PEACH_PI_R2_S3_ENDPOINT + PEACH_PI_R2_FORCE_PATH_STYLE), GCS, etc.
            bucket: process.env.PEACH_PI_R2_BUCKET,
            // Path suffix after bucket → folder key prefix. If
            // PEACH_PI_UPDATE_URL is https://host/peach-pi, manifest files
            // live under the `peach-pi` key.
            folder:
              (() => {
                try {
                  return decodeURIComponent(
                    new URL(process.env.PEACH_PI_UPDATE_URL!).pathname,
                  ).replace(/^\//, "");
                } catch {
                  return "";
                }
              })(),
            accessKeyId: process.env.PEACH_PI_R2_ACCESS_KEY_ID,
            secretAccessKey: process.env.PEACH_PI_R2_SECRET_ACCESS_KEY,
            ...(process.env.PEACH_PI_R2_S3_ENDPOINT ? { endpoint: process.env.PEACH_PI_R2_S3_ENDPOINT } : {}),
            ...(process.env.PEACH_PI_R2_REGION ? { region: process.env.PEACH_PI_R2_REGION } : {}),
            s3ForcePathStyle: process.env.PEACH_PI_R2_FORCE_PATH_STYLE === "1",
            // R2 rejects ACLs; public access comes from the bucket's r2.dev
            // subdomain or a custom domain, so omit the ACL header.
            omitAcl: process.env.PEACH_PI_R2_OMIT_ACL === "1",
            public: true,
          }),
        ],
      }
    : {}),
  plugins: [
    new VitePlugin({
      build: [
        { entry: "electron/main.ts", config: "vite.main.config.ts", target: "main" },
        { entry: "electron/preload.ts", config: "vite.preload.config.ts", target: "preload" },
      ],
      renderer: [{ name: "main_window", config: "vite.renderer.config.ts" }],
    }),
  ],
};

export default config;
