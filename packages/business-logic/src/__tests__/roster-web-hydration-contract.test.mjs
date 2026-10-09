import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename,
);
const code=fs.readFileSync("apps/web/src/lib/data-source-roster.ts","utf8");
const source=fs.readFileSync("apps/web/src/lib/data-source.ts","utf8");
const page=fs.readFileSync("apps/web/src/app/(app)/roster/page.tsx","utf8");
const nav=fs.readFileSync("packages/ui/src/lib/nav.ts","utf8");
const layout=fs.readFileSync("apps/web/src/components/AppLayoutClient.tsx","utf8");
assert.match(code,/pgSelectAll<Row>\(cfg, "staff_shift_rules"/);
assert.match(code,/pgSelectAll<Row>\(cfg, "staff_roster_slots"/);
assert.match(code,/if \(!cfg.accessToken\)/);
assert.match(source,/ensureNoUnconfirmedRosterEvents\(exportOutbox\(\)\)/);
assert.match(source,/rosterRows = await loadCloudRoster\(cfg\)/);
assert.match(source,/rosterRows\.shiftRules, rosterSlots: rosterRows\.rosterSlots/);
assert.match(source,/registerRemoteWriter\(null\)/);
assert.match(page,/if \(!ready\) return/);
assert.match(page,/canEdit=\{false\}/);
assert.match(nav,/href: "\/roster"/);
assert.match(layout,/"\/roster": "roster"/);
assert.doesNotMatch(code,/service_role|SUPABASE_SECRET|SUPABASE_SERVICE_ROLE_KEY/);
assert.doesNotMatch(page,/pgInsert|pgUpdate|pgRpc/);
console.log("HR-004 authenticated web roster hydration/read-only route contract PASS");
