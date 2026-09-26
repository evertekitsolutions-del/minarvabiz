import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);

const permissions = require("../permissions.ts");
const lockState = require("../business-day-state.ts");
const dayEnd = require("../day-end.ts");

dayEnd.hydrateDayEnd({ closes: [] });
permissions.setRuntimeFeaturePolicy(null);
permissions.setCurrentRole("manager");

const today = lockState.localBusinessDate();
assert.equal(lockState.isBusinessDayClosed(today), false);
assert.doesNotThrow(() => lockState.assertBusinessDayOpen(today));

const closed = dayEnd.closeBusinessDay();
assert.equal(closed.error, undefined);
assert.equal(closed.record?.businessDate, today);
assert.equal(closed.record?.closedByRole, "manager");
assert.equal(lockState.isBusinessDayClosed(today), true);
assert.throws(() => lockState.assertBusinessDayOpen(today), /is closed/);

const duplicate = dayEnd.closeBusinessDay(today);
assert.equal(duplicate.record, null);
assert.match(duplicate.error ?? "", /already closed/);

const missingReason = dayEnd.reopenBusinessDay(today, " ");
assert.equal(missingReason.record, null);
assert.match(missingReason.error ?? "", /reason is required/i);

permissions.setCurrentRole("cashier");
const denied = dayEnd.reopenBusinessDay(today, "Correction required");
assert.equal(denied.record, null);
assert.match(denied.error ?? "", /Permission denied: dayend\.reopen/);
assert.equal(lockState.isBusinessDayClosed(today), true);

permissions.setCurrentRole("manager");
const reopened = dayEnd.reopenBusinessDay(today, "Correction required");
assert.equal(reopened.error, undefined);
assert.equal(reopened.record?.reopenReason, "Correction required");
assert.equal(reopened.record?.reopenedByRole, "manager");
assert.equal(lockState.isBusinessDayClosed(today), false);
assert.doesNotThrow(() => lockState.assertBusinessDayOpen(today));

const history = dayEnd.listDayEndCloses();
assert.equal(history.length, 1);
assert.equal(history[0].reopenReason, "Correction required");
assert.equal(dayEnd.getDayEndClose(today), undefined);

const absent = dayEnd.reopenBusinessDay(today, "Second correction");
assert.equal(absent.record, null);
assert.match(absent.error ?? "", /is not closed/);

const invalidClose = dayEnd.closeBusinessDay("not-a-date");
assert.equal(invalidClose.record, null);
assert.equal(invalidClose.error, "Invalid business date");

permissions.setCurrentRole("staff");
const closeDenied = dayEnd.closeBusinessDay();
assert.equal(closeDenied.record, null);
assert.match(closeDenied.error ?? "", /Permission denied: dayend\.close/);

dayEnd.hydrateDayEnd({
  closes: [{
    ...history[0],
    reopenedAt: null,
    reopenedByRole: null,
    reopenReason: null,
  }],
});
assert.equal(lockState.isBusinessDayClosed(today), true);

dayEnd.hydrateDayEnd({ closes: [] });
permissions.setCurrentRole(null);
assert.equal(lockState.isBusinessDayClosed(today), false);

console.log("Day-end governance runtime PASS");
