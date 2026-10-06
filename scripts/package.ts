// Builds Daycare.app for this Mac and installs it to /Applications.
// Run: bun run package [--no-install]

import { packager, type SupportedArch } from "@electron/packager"
import { execFileSync } from "node:child_process"
import { cpSync, existsSync, renameSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"

const root = path.resolve(import.meta.dir, "..")
const install = !process.argv.includes("--no-install")

// Lets the installed app find this checkout for Settings > Update.
const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).trim()
writeFileSync(
  path.join(root, "dist/build-info.json"),
  JSON.stringify({ sourceDir: root, commit, builtAt: new Date().toISOString() }, null, 2),
)

const [outDir] = await packager({
  dir: root,
  name: "Daycare",
  executableName: "Daycare",
  appBundleId: "com.andrewlaskin.daycare",
  appCategoryType: "public.app-category.developer-tools",
  icon: path.join(root, "assets/brand/Daycare.icns"),
  platform: "darwin",
  arch: process.arch as SupportedArch,
  out: path.join(root, "out"),
  overwrite: true,
  // Main is bundled; only node-pty loads at runtime.
  prune: false,
  // Native code cannot load from inside an asar.
  asar: { unpack: "**/node_modules/node-pty/**" },
  ignore: [
    /^\/(?!(dist|assets|node_modules|package\.json)(\/|$))/,
    /^\/node_modules\/(?!node-pty(\/|$))/,
    // Only this Mac's node-pty build.
    new RegExp(`^/node_modules/node-pty/prebuilds/(?!darwin-${process.arch}($|/))`),
    /^\/node_modules\/node-pty\/(third_party|deps|src)($|\/)/,
    // The renderer has its own copies of fonts and sprites.
    /^\/assets\/(?!brand(\/|$))/,
    /^\/assets\/brand\/(render\.js$|logos\/.*\.svg$)/,
  ],
  extendInfo: { NSHumanReadableCopyright: "Andrew Laskin" },
})

const built = path.join(outDir!, "Daycare.app")
// Packaging breaks Electron's signature; Apple Silicon needs one.
execFileSync("codesign", ["--force", "--deep", "--sign", "-", built], { stdio: "inherit" })

if (!install) {
  console.log(`Built ${built}`)
  process.exit(0)
}

// Swap by rename so a running copy keeps working.
const installed = "/Applications/Daycare.app"
const staged = `${installed}.new`
const old = `${installed}.old`
for (const p of [staged, old]) rmSync(p, { recursive: true, force: true })
cpSync(built, staged, { recursive: true, verbatimSymlinks: true })
if (existsSync(installed)) renameSync(installed, old)
renameSync(staged, installed)
rmSync(old, { recursive: true, force: true })
console.log(`Installed ${installed}`)
