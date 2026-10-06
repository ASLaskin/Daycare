// Builds Daycare.app and installs it unless --no-install.

import { packager, type SupportedArch } from "@electron/packager"
import { execFileSync } from "node:child_process"
import { cpSync, existsSync, renameSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"

const root = path.resolve(import.meta.dir, "..")
const install = !process.argv.includes("--no-install")

// Record the source checkout and commit
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
  prune: false,
  // Keep node-pty outside the asar
  asar: { unpack: "**/node_modules/node-pty/**" },
  ignore: [
    /^\/(?!(dist|assets|node_modules|package\.json)(\/|$))/,
    /^\/node_modules\/(?!node-pty(\/|$))/,
    // Drop node-pty builds for other platforms
    new RegExp(`^/node_modules/node-pty/prebuilds/(?!darwin-${process.arch}($|/))`),
    /^\/node_modules\/node-pty\/(third_party|deps|src)($|\/)/,
    // Drop assets the renderer already bundles
    /^\/assets\/(?!brand(\/|$))/,
    /^\/assets\/brand\/(render\.js$|logos\/.*\.svg$)/,
  ],
  extendInfo: { NSHumanReadableCopyright: "Andrew Laskin" },
})

const built = path.join(outDir!, "Daycare.app")
// Ad hoc sign the bundle
execFileSync("codesign", ["--force", "--deep", "--sign", "-", built], { stdio: "inherit" })

if (!install) {
  console.log(`Built ${built}`)
  process.exit(0)
}

// Swap the new bundle into /Applications by rename
const installed = "/Applications/Daycare.app"
const staged = `${installed}.new`
const old = `${installed}.old`
const leftovers = [staged, old]
leftovers.forEach((p) => rmSync(p, { recursive: true, force: true }))
cpSync(built, staged, { recursive: true, verbatimSymlinks: true })
if (existsSync(installed)) {
  renameSync(installed, old)
}
renameSync(staged, installed)
rmSync(old, { recursive: true, force: true })
console.log(`Installed ${installed}`)
