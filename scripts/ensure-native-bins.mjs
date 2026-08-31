/**
 * Ensures electron/esbuild postinstall artefacts exist after pnpm install.
 * Safe no-op if packages are not present (e.g. web-only install).
 */
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import path from "node:path";

const require = createRequire(import.meta.url);

function tryRebuild(pkgName, installScriptRelative) {
  try {
    const pkgJson = require.resolve(`${pkgName}/package.json`);
    const root = path.dirname(pkgJson);
    const script = path.join(root, installScriptRelative);
    if (!existsSync(script)) return;
    // Only run if binary missing for electron
    if (pkgName === "electron") {
      const dist = path.join(root, "dist", "electron");
      const distExe = path.join(root, "dist", "electron.exe");
      if (existsSync(dist) || existsSync(distExe)) return;
    }
    spawnSync(process.execPath, [script], { cwd: root, stdio: "inherit", env: process.env });
  } catch {
    // package not installed in this workspace slice
  }
}

tryRebuild("electron", "install.js");
tryRebuild("esbuild", "install.js");
