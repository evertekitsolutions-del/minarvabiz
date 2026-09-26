import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../../../..");
const read=(p)=>fs.readFileSync(path.join(root,p),"utf8");

const list=read("packages/ui/src/components/laundry/LaundryList.tsx");
const cancelForm=read("packages/ui/src/components/laundry/LaundryCancellationForm.tsx");
const logic=read("packages/business-logic/src/phase5-store.ts");
const desktop=read("apps/desktop/src/App.tsx");
const web=read("apps/web/src/app/(app)/laundry/page.tsx");
const webSmoke=read("scripts/web-ui-deep-smoke.mjs");
const winSmoke=read("scripts/windows-populated-deep-smoke.mjs");

for(const token of [
  "Search ticket, customer, garment or supplier",
  "All customers",
  "All modes",
  "All statuses",
  "All suppliers",
  'type="date"',
  "Details",
  "Edit Details",
  "Ticket history",
  "Financial values are posted at ticket creation and stay immutable",
]) assert.equal(list.includes(token),true,`Missing laundry record control: ${token}`);

assert.equal(cancelForm.includes("Cancellation reason *"),true);
assert.equal(cancelForm.includes("Supplier cost handling"),true);
assert.equal(cancelForm.includes("refund payment method"),true);

assert.equal(logic.includes("export function updateLaundryDetails"),true);
assert.equal(logic.includes("Cancelled laundry tickets are immutable"),true);
assert.equal(logic.includes("Cancellation reason is required"),true);
assert.equal(logic.includes('auditAction("laundry.update_details"'),true);
assert.equal(logic.includes('auditAction("laundry.cancel"'),true);
assert.equal(logic.includes('auditAction("laundry.status"'),true);

assert.equal(desktop.includes("onUpdateDetails={handleLaundryDetailsUpdate}"),true);
assert.equal(web.includes("onUpdateDetails={handleUpdateLaundryDetails}"),true);
assert.equal(webSmoke.includes("Customer requested cancellation"),true);
assert.equal(winSmoke.includes("Customer requested cancellation"),true);

console.log("Laundry record management contract PASS");
