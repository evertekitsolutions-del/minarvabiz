import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);

const permissions = require("../permissions.ts");
const phase7 = require("../phase7-store.ts");

phase7.hydratePhase7({ auditLogs: [], returns: [] });
permissions.setCurrentRole("manager");
phase7.recordAudit("customer.update", "customers", "cust-1", { name: "Before" }, { name: "After" });
let logs = phase7.listAuditLogs(10);
assert.equal(logs.length, 1);
assert.equal(logs[0].userName, "Manager");
assert.equal(logs[0].action, "customer.update");
assert.equal(logs[0].tableName, "customers");
assert.equal(logs[0].recordId, "cust-1");
assert.deepEqual(JSON.parse(logs[0].oldValue), { name: "Before" });
assert.deepEqual(JSON.parse(logs[0].newValue), { name: "After" });

permissions.setCurrentRole(null);
phase7.recordAudit("system.check", "system", "sys-1", null, { ok: true });
logs = phase7.listAuditLogs(10);
assert.equal(logs[0].userName, "System");
assert.equal(logs[0].action, "system.check");

console.log("Audit log attribution runtime PASS");
