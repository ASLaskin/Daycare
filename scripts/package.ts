// Builds Daycare for this platform and installs it unless --no-install.

import { packager, type SupportedArch } from "@electron/packager"
import { execFileSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const root = path.resolve(import.meta.dir, "..")
const install = !process.argv.includes("--no-install")
const linux = process.platform === "linux"

// Record the source checkout, branch and commit
const git = (...args: Array<string>) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim()
const commit = git("rev-parse", "--short", "HEAD")
const branch = git("branch", "--show-current") || null
writeFileSync(
  path.join(root, "dist/build-info.json"),
  JSON.stringify({ sourceDir: root, branch, commit, builtAt: new Date().toISOString() }, null, 2),
)

const [outDir] = await packager({
  dir: root,
  name: "Daycare",
  executableName: "Daycare",
  appBundleId: "com.andrewlaskin.daycare",
  appCategoryType: "public.app-category.developer-tools",
  icon: path.join(root, "assets/brand/Daycare.icns"),
  platform: linux ? "linux" : "darwin",
  arch: process.arch as SupportedArch,
  out: path.join(root, "out"),
  overwrite: true,
  prune: false,
  // Executables cannot run from inside the archive
  asar: { unpack: "**/dist/daycare-coordinator" },
  ignore: [
    /^\/(?!(dist|assets|package\.json)(\/|$))/,
    // Drop assets the renderer already bundles
    /^\/assets\/(?!brand(\/|$))/,
    /^\/assets\/brand\/(render\.js$|logos\/.*\.svg$)/,
  ],
  extendInfo: { NSHumanReadableCopyright: "Andrew Laskin" },
})

const built = linux ? outDir! : path.join(outDir!, "Daycare.app")
if (!linux) {
  // Ad hoc sign the bundle
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", built], { stdio: "inherit" })
}

if (!install) {
  console.log(`Built ${built}`)
  process.exit(0)
}

const installed = linux ? path.join(os.homedir(), ".local", "opt", "Daycare") : "/Applications/Daycare.app"

// Swap the new build into place by rename
const staged = `${installed}.new`
const old = `${installed}.old`
const leftovers = [staged, old]
leftovers.forEach((p) => rmSync(p, { recursive: true, force: true }))
mkdirSync(path.dirname(installed), { recursive: true })
cpSync(built, staged, { recursive: true, verbatimSymlinks: true })
if (linux) {
  // Launchers cannot read inside the archive
  cpSync(path.join(root, "assets/brand/logos/block.png"), path.join(staged, "daycare.png"))
}
if (existsSync(installed)) {
  renameSync(installed, old)
}
renameSync(staged, installed)
rmSync(old, { recursive: true, force: true })

if (linux) {
  const apps = path.join(process.env["XDG_DATA_HOME"] || path.join(os.homedir(), ".local", "share"), "applications")
  mkdirSync(apps, { recursive: true })
  writeFileSync(
    path.join(apps, "daycare.desktop"),
    [
      "[Desktop Entry]",
      "Type=Application",
      "Name=Daycare",
      "Comment=Agent orchestrator",
      `Exec="${path.join(installed, "Daycare")}"`,
      `Icon=${path.join(installed, "daycare.png")}`,
      "StartupWMClass=daycare",
      "Categories=Development;",
      "",
    ].join("\n"),
  )
}
console.log(`Installed ${installed}`)
