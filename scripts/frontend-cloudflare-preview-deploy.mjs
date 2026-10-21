import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = path.join(root, "apps", "web");
if ([process.env.MINARVA_MODE, process.env.NEXT_PUBLIC_MINARVA_MODE].some(
  (value) => String(value || "").trim().toLowerCase() === "demo",
) || String(process.env.NEXT_PUBLIC_REQUIRE_AUTH || "").trim().toLowerCase() === "false") {
  console.error("Cloudflare customer deployment forbids demo mode and authentication bypass.");
  process.exit(2);
}
const lock = readFileSync(path.join(root, "pnpm-lock.yaml"), "utf8");
const webImporter = lock.match(/^  apps\/web:\n([\s\S]*?)(?=^  [^ ]|^packages:|^snapshots:)/m)?.[1] ?? "";
const version = webImporter.match(/^      next:\n        specifier: [^\n]+\n        version: (\d+)\.(\d+)\.(\d+)/m);
if (!version) throw new Error("Cannot verify locked Next.js version for apps/web");
const [major, minor, patch] = version.slice(1).map(Number);
// OpenNext 1.20.12 checks the Next.js team support window; 15.x has
// passed that window even if a late patch meets the old vulnerability floor.
const supported = major === 16 && (minor > 4 || (minor === 4 && patch >= 1));
const buildOnly = process.argv.includes("--build-only");
const deployOnly = process.argv.includes("--deploy-only");
if (buildOnly && deployOnly) throw new Error("Select --build-only or --deploy-only, not both");
if (!supported) {
  console.error(`Cloudflare adapter deployment blocked: locked Next.js ${major}.${minor}.${patch} is not an approved supported Next.js release (minimum: 16.4.1).`);
  process.exit(2);
}
const pkg = JSON.parse(readFileSync(path.join(app, "package.json"), "utf8"));
if (!pkg.devDependencies?.["@opennextjs/cloudflare"] || !pkg.devDependencies?.wrangler) {
  console.error("Cloudflare adapter dependencies must first be pinned and committed in apps/web/package.json and pnpm-lock.yaml.");
  process.exit(2);
}
for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]) {
  if (!process.env[key] || /change-me|your-project|placeholder/i.test(process.env[key])) {
    console.error(`Missing real public deployment configuration: ${key}`);
    process.exit(2);
  }
}
if (!buildOnly && process.env.MINARVA_APPROVE_CLOUDFLARE_PREVIEW_DEPLOY !== "1") {
  console.error("Deployment requires explicit MINARVA_APPROVE_CLOUDFLARE_PREVIEW_DEPLOY=1.");
  process.exit(2);
}
const buildEnv = {
  ...process.env,
  NODE_ENV: "production",
  MINARVA_MODE: "production",
  NEXT_PUBLIC_MINARVA_MODE: "production",
  NEXT_PUBLIC_REQUIRE_AUTH: "true",
};
if (deployOnly && !existsSync(path.join(app, ".open-next", "worker.js"))) {
  throw new Error("No compiled customer Worker: run --build-only first in this checked checkout");
}
for (const args of [
  ...(!deployOnly ? [["--filter", "@minarvabiz/web", "exec", "opennextjs-cloudflare", "build"]] : []),
  ...(!buildOnly ? [["--filter", "@minarvabiz/web", "exec", "wrangler", "deploy"]] : []),
]) {
  const result = spawnSync("pnpm", args, { cwd: root, env: buildEnv, stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
