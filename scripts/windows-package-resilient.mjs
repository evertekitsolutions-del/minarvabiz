import { spawn } from "node:child_process";

// Build with the normal trusted GitHub distribution first. Fall back only for
// upstream 502/503/504 release downloads; never retry failed tests or packaging errors.
const command = ["--filter", "@minarvabiz/desktop", "run", "package:win"];
const releaseAssetFailure = /cannot resolve https:\/\/github\.com\/(?:electron\/electron|electron-userland\/electron-builder-binaries)\/releases\/download\/[^\r\n]*status code (?:502|503|504)/i;

function build(extraEnv = {}) {
  return new Promise((resolve, reject) => {
    let output = "";
    const child = spawn("pnpm", command, {
      env: { ...process.env, ...extraEnv },
      shell: process.platform === "win32",
      stdio: ["inherit", "pipe", "pipe"],
    });
    for (const [stream, target] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
      stream.on("data", (chunk) => {
        target.write(chunk);
        output = (output + chunk.toString("utf8")).slice(-120_000);
      });
    }
    child.on("error", reject);
    child.on("close", (code, signal) => resolve({ code, signal, output }));
  });
}

const initial = await build();
if (initial.code === 0) {
  console.log("WINDOWS_PACKAGE_PASS source=official");
} else if (!releaseAssetFailure.test(initial.output)) {
  console.error("Windows package failure is not a transient official binary download; refusing fallback.");
  process.exitCode = 1;
} else {
  console.warn("Official Electron/electron-builder release returned 502/503/504; trying external mirror once.");
  // Mirrors are only a transport fallback. Electron/Builder checksum validation stays enabled.
  const retry = await build({
    ELECTRON_MIRROR: "https://registry.npmmirror.com/-/binary/electron/",
    ELECTRON_BUILDER_BINARIES_MIRROR: "https://registry.npmmirror.com/-/binary/electron-builder-binaries/",
  });
  if (retry.code !== 0) {
    console.error("Fallback Windows packaging failed; keeping CI red and blocking release.");
    process.exitCode = 1;
  } else {
    console.log("WINDOWS_PACKAGE_PASS source=fallback_mirror");
  }
}
