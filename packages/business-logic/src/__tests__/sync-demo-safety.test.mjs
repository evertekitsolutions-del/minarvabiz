import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  filename,
);
const { assertMemorySyncDemoMode } = require("../sync-demo-policy.ts");

test("in-memory sync is allowed only in explicit demo mode", () => {
  assert.doesNotThrow(() => assertMemorySyncDemoMode("demo"));
  for (const mode of ["production", "development", undefined, "", "offline", "hybrid"]) {
    assert.throws(
      () => assertMemorySyncDemoMode(mode),
      /demo-only.*no cloud transport/i,
      `Unexpectedly allowed in-memory sync for ${String(mode)}`,
    );
  }
});

test("production sync bridge identifies simulation and guards all demo mutations", () => {
  const src = fs.readFileSync("packages/business-logic/src/sync-bridge.ts", "utf8");
  assert.match(src, /cloudSyncAvailable:\s*false/);
  assert.match(src, /demoMode:\s*isDemoMode\(\)/);
  for (const [name, next] of [
    ["runSync", "enqueueDemoWrite"],
    ["enqueueDemoWrite", "setSyncOnline"],
    ["setSyncOnline", "resolveSyncConflict"],
  ]) {
    const start = src.indexOf(`export ${name === "runSync" ? "async " : ""}function ${name}(`);
    const end = src.indexOf(`export function ${next}(`, start);
    assert.ok(start >= 0, `${name} must exist`);
    const body = src.slice(start, end >= 0 ? end : undefined);
    assert.match(body, /assertMemorySyncDemoMode\(getRuntimeMode\(\)\)/, `${name} must fail closed`);
  }
});

test("production settings do not advertise demo memory sync as real cloud transfer", () => {
  const panel = fs.readFileSync("packages/ui/src/components/sync/SyncPanel.tsx", "utf8");
  const page = fs.readFileSync("apps/web/src/app/(app)/settings/page.tsx", "utf8");
  assert.match(panel, /if \(!cloudSyncAvailable && !demoMode\)/);
  assert.match(panel, /Cloud synchronization is not configured/);
  assert.match(panel, /No data is uploaded/);
  assert.match(panel, /In-memory simulation only/);
  assert.match(page, /cloudSyncAvailable=\{snap\.cloudSyncAvailable\}/);
  assert.match(page, /demoMode=\{snap\.demoMode\}/);
});
