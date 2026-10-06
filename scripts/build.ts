// Bundles the three Electron targets with Bun. Main and preload run in
// Electron's own Node, so they are CommonJS with electron and node-pty left as
// runtime requires; the renderer is a plain browser bundle built from its HTML.
// Run: bun scripts/build.ts

import { rmSync } from "node:fs"
import path from "node:path"

const root = path.resolve(import.meta.dir, "..")
const out = path.join(root, "dist")

rmSync(out, { recursive: true, force: true })

const builds = await Promise.all([
  Bun.build({
    entrypoints: [path.join(root, "src/main/main.ts")],
    outdir: out,
    target: "node",
    format: "cjs",
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
console.log(`Built ${builds.flatMap((b) => b.outputs).length} files into dist/`)
