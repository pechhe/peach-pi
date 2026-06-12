import fs from "node:fs";
import path from "node:path";
import type { ForgeConfig } from "@electron-forge/shared-types";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { MakerZIP } from "@electron-forge/maker-zip";
import { MakerDMG } from "@electron-forge/maker-dmg";

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
    // Native N-API prebuilds (clipboard, pi-tui) must live outside the asar.
    // node-pty's prebuilds dir also holds the spawn-helper executable.
    asar: { unpack: "{**/*.node,**/node-pty/prebuilds/**}" },
    // Notarization/signing wired once certs are configured:
    // osxSign: {}, osxNotarize: { ... }
  },
  hooks: {
    packageAfterCopy: async (_config, buildPath) => {
      vendorPiSdk(buildPath);
    },
  },
  makers: [new MakerZIP({}, ["darwin"]), new MakerDMG({}, ["darwin"])],
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
