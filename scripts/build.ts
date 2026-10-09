// Bundles main, preload, renderer and the coordinator into dist.

import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs"
import path from "node:path"

const root = path.resolve(import.meta.dir, "..")
const out = path.join(root, "dist")

rmSync(out, { recursive: true, force: true })

const builds = await Promise.all([
  Bun.build({
    entrypoints: [path.join(root, "src/main/main.ts")],
    outdir: out,
    naming: "[name].mjs",
    target: "node",
    format: "esm",
    external: ["electron"],
    sourcemap: "linked",
  }),
  Bun.build({
    entrypoints: [path.join(root, "src/preload/preload.ts")],
    outdir: out,
    target: "node",
    format: "cjs",
    external: ["electron"],
    sourcemap: "linked",
  }),
  // Standalone executable, run from outside the app archive
  Bun.build({
    entrypoints: [path.join(root, "src/coordinator/main.ts")],
    compile: { outfile: path.join(out, "daycare-coordinator") },
    // Only dbus-next's X11 fallback needs it, never used under systemd
    external: ["x11"],
    sourcemap: "linked",
  }),
  Bun.build({
    entrypoints: [path.join(root, "src/renderer/index.html")],
    outdir: path.join(out, "renderer"),
    target: "browser",
    sourcemap: "linked",
  }),
])

const failed = builds.filter((build) => !build.success)
if (failed.length) {
  failed.flatMap((build) => build.logs).forEach((log) => console.error(log))
  process.exit(1)
}

// Copy sprites into the renderer output
const icons = path.join(root, "assets/icons")
const iconsOut = path.join(out, "renderer/icons")
mkdirSync(iconsOut, { recursive: true })
readdirSync(icons)
  .filter((file) => /\.(gif|png)$/.test(file))
  .forEach((file) => cpSync(path.join(icons, file), path.join(iconsOut, file)))

console.log(`Built ${builds.flatMap((b) => b.outputs).length} files into dist/`)
