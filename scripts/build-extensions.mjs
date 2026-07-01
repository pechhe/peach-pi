// Stages peach-owned pi extensions from their type-checked source into loadable
// assets under <out>/extensions/. Run by `pnpm predev` (dev, default out) and
// the Forge `packageAfterCopy` hook (packaged, out = buildPath/electron/build),
// alongside vendorPiSdk.
//
// The extension source (e.g. packages/pi-client/src/extensions/peach-secrets.ts)
// is real TypeScript in the type graph: it imports the typed tools contract
// from `@peach-pi/shared-types` in type positions. The pi strip-types loader
// cannot resolve `@peach-pi/shared-types` (a peach-pi workspace package, not an
// SDK dependency), so the build erases that type-only import before staging.
// Bare specifiers the loader resolves at runtime (`typebox`,
// `@earendil-works/pi-coding-agent`) are left untouched.
//
// Manifest: packages/pi-client/src/extensions/manifest.json
//   { "extensions": { "<asset-name>": "<src-rel-path>" } }
//
// Usage:
//   node scripts/build-extensions.mjs                 # default out: <root>/apps/desktop/electron/build/extensions
//   node scripts/build-extensions.mjs --out <dir>     # stage into <dir>/extensions
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MANIFEST = path.join(ROOT, "packages/pi-client/src/extensions/manifest.json");

function parseOutArg(argv) {
  const i = argv.indexOf("--out");
  if (i !== -1 && argv[i + 1]) return argv[i + 1];
  return path.join(ROOT, "apps/desktop/electron/build/extensions");
}

/** Erase `@peach-pi/shared-types` type-only imports the loader can't resolve. */
function eraseSharedTypesImports(src) {
  // Drop any import statement (single- or multi-line) that resolves to the
  // peach-pi workspace package. These are type-only at the extension site, so
  // removing them is safe; the contract's runtime values live in `typebox`,
  // which the SDK ships.
  const sharedTypesImport = /import\b[^;]*?from\s+["']@peach-pi\/shared-types["'];/gs;
  return src.replace(sharedTypesImport, "");
}

async function stageExtension(name, srcRel, outDir) {
  // srcRel is relative to packages/pi-client/src (per the manifest).
  const srcPath = path.resolve(ROOT, "packages/pi-client/src", srcRel);
  const raw = await readFile(srcPath, "utf8");
  const staged = eraseSharedTypesImports(raw);
  const dest = path.join(outDir, `${name}.ts`);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, staged, "utf8");
  console.log(`build-extensions: staged ${name} -> ${path.relative(ROOT, dest)}`);
}

async function main() {
  const outDir = parseOutArg(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
  const entries = Object.entries(manifest.extensions ?? {});
  if (entries.length === 0) {
    console.log("build-extensions: no extensions in manifest");
    return;
  }
  for (const [name, srcRel] of entries) {
    await stageExtension(name, srcRel, outDir);
  }
}

main().catch((err) => {
  console.error("build-extensions: failed:", err);
  process.exit(1);
});
