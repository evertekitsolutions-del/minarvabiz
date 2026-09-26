import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const ui = read("packages/ui/src/components/audit/AuditLogList.tsx");
const phase7 = read("packages/business-logic/src/phase7-store.ts");
const web = read("apps/web/src/app/(app)/audit/page.tsx");
const offline = read("packages/ui/src/components/desktop/OfflineModulesPanel.tsx");

for (const token of [
  "Search actor, action, entity or record",
  "All actions",
  "All entities",
  "Export CSV",
  "Audit detail",
  "Before",
  "After",
  'type="date"',
]) assert.equal(ui.includes(token), true, `Missing Audit Log professional control: ${token}`);

assert.equal(ui.includes("URL.createObjectURL"), true);
assert.equal(ui.includes("minarva-biz-audit-"), true);
assert.equal(phase7.includes("getCurrentRole"), true);
assert.equal(phase7.includes('"System"'), true);
assert.equal(web.includes("<AuditLogList logs={logs}"), true);
assert.equal(offline.includes("<AuditLogList logs={phase7Store.listAuditLogs(500)}"), true);

console.log("Audit log professional controls contract PASS");
