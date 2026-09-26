import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const permissions = read("packages/business-logic/src/permissions.ts");
const dayEnd = read("packages/business-logic/src/day-end.ts");
const ui = read("packages/ui/src/components/reports/DayEndClose.tsx");
const web = read("apps/web/src/app/(app)/reports/page.tsx");
const webRoute = read("apps/web/src/app/(app)/day-end/page.tsx");
const desktop = read("apps/desktop/src/App.tsx");
const desktopDayEnd = read("apps/desktop/src/components/DesktopDayEndPanel.tsx");
const lockState = read("packages/business-logic/src/business-day-state.ts");
const store = read("packages/business-logic/src/store.ts");
const orders = read("packages/business-logic/src/orders-store.ts");
const phase5 = read("packages/business-logic/src/phase5-store.ts");
const phase7 = read("packages/business-logic/src/phase7-store.ts");

for (const token of [
  '"dayend.close"',
  '"dayend.reopen"',
]) assert.equal(permissions.includes(token), true, `Missing Day-end permission: ${token}`);

for (const token of [
  'assertPermission("dayend.close")',
  'assertPermission("dayend.reopen")',
  "reopenBusinessDay",
  "reopenReason",
  'auditAction("day_end.close"',
  'auditAction("day_end.reopen"',
  "assertBusinessDayOpen",
]) assert.equal(dayEnd.includes(token), true, `Missing Day-end governance behavior: ${token}`);

for (const token of [
  "Close & lock today",
  "Reopen day",
  "Reopen reason",
  "Confirm reopen",
  "window.confirm",
]) assert.equal(ui.includes(token), true, `Missing Day-end governance UI: ${token}`);

assert.equal(web.includes('canClose={can("dayend.close")}'), true);
assert.equal(web.includes('canReopen={can("dayend.reopen")}'), true);
assert.equal(web.includes("onReopenDay"), true);
assert.equal(webRoute.includes('redirect("/reports#day-end-close")'), true);

assert.equal(desktop.includes('view==="day-end"&&<DesktopDayEndPanel'), true);
assert.equal(desktopDayEnd.includes('canClose={can("dayend.close")}'), true);
assert.equal(desktopDayEnd.includes('canReopen={can("dayend.reopen")}'), true);
assert.equal(desktopDayEnd.includes("onReopenDay"), true);
assert.equal(lockState.includes("assertBusinessDayOpen"), true);
assert.equal(lockState.includes("lockBusinessDay"), true);
assert.equal(lockState.includes("unlockBusinessDay"), true);

for (const [name, source] of [
  ["core sales/payment store", store],
  ["orders store", orders],
  ["expense/purchase/laundry store", phase5],
  ["returns store", phase7],
]) assert.equal(source.includes("assertBusinessDayOpen"), true, `Missing closed-day write guard in ${name}`);

console.log("Day-end governance contract PASS");
