// Main is ESM for import.meta; preload must be CJS.

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
    external: ["electron", "node-pty"],
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
  Bun.build({
    entrypoints: [path.join(root, "src/renderer/index.html")],
    outdir: path.join(out, "renderer"),
    target: "browser",
    sourcemap: "linked",
  }),
])

for (const build of builds) {
  if (!build.success) {
    for (const log of build.logs) console.error(log)
    process.exit(1)
  }
}
// Sprites load by name, so copied.
const icons = path.join(root, "assets/icons")
const iconsOut = path.join(out, "renderer/icons")
mkdirSync(iconsOut, { recursive: true })
for (const file of readdirSync(icons)) {
  if (/\.(gif|png)$/.test(file)) cpSync(path.join(icons, file), path.join(iconsOut, file))
}

console.log(`Built ${builds.flatMap((b) => b.outputs).length} files into dist/`)
