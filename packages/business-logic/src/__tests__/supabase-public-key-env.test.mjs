import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) =>
  module._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    filename
  );

const { isSupabaseConfigured, configFromEnv } = require("../../../database/src/client/postgrest.ts");

const modern = {
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key",
};
assert.equal(isSupabaseConfigured(modern), true);
assert.equal(configFromEnv(modern)?.anonKey, "sb_publishable_test_key");

const legacy = {
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "legacy-anon-key",
};
assert.equal(isSupabaseConfigured(legacy), true);
assert.equal(configFromEnv(legacy)?.anonKey, "legacy-anon-key");

const precedence = {
  ...legacy,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_preferred",
};
assert.equal(configFromEnv(precedence)?.anonKey, "sb_publishable_preferred");

assert.equal(isSupabaseConfigured({ NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co" }), false);

console.log("Supabase public-key env compatibility tests passed");
