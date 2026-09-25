import { spawnSync } from "node:child_process";

const publicDefaults = {
  APP_VERSION: "1.0.5",
  APP_EDITION: "online",
  MINARVA_MODE: "production",
  NEXT_PUBLIC_MINARVA_MODE: "production",
  NEXT_PUBLIC_REQUIRE_AUTH: "true",
  NEXT_PUBLIC_SUPABASE_URL: "https://wmjgefbaliuwmaxyzxkq.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_5jIjE_KhGJD9k6GDkeo-Xw_riNs-BWG",
};

for (const [key, value] of Object.entries(publicDefaults)) {
  if (!String(process.env[key] || "").trim()) process.env[key] = value;
}

const result = spawnSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["build"], {
  stdio: "inherit",
  env: process.env,
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
