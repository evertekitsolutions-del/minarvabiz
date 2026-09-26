import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const customerList = read("packages/ui/src/components/customers/CustomerList.tsx");
const supplierList = read("packages/ui/src/components/suppliers/SupplierList.tsx");
const customerWeb = read("apps/web/src/app/(app)/customers/page.tsx");
const supplierWeb = read("apps/web/src/app/(app)/suppliers/page.tsx");
const desktopCustomer = read("apps/desktop/src/components/DesktopCustomerMasterPanel.tsx");
const offline = read("packages/ui/src/components/desktop/OfflineModulesPanel.tsx");
const app = read("apps/desktop/src/App.tsx");
const customerStore = read("packages/business-logic/src/store.ts");
const supplierStore = read("packages/business-logic/src/phase5-store.ts");

assert.match(customerList, /onEdit/);
assert.match(customerList, /onArchive/);
assert.match(customerList, />Edit</);
assert.match(customerList, />Archive</);
assert.match(supplierList, /onEdit/);
assert.match(supplierList, /onArchive/);

assert.match(customerWeb, /Archive reason \*/);
assert.match(customerWeb, /soft archive/i);
assert.match(customerWeb, /outstanding balance/i);
assert.match(supplierWeb, /Archive reason \*/);
assert.match(supplierWeb, /Opening balance is an accounting source and cannot be edited here/);
assert.match(supplierWeb, /outstanding payables/i);

assert.match(desktopCustomer, /store\.updateCustomer/);
assert.match(desktopCustomer, /store\.archiveCustomer/);
assert.match(offline, /phase5Store\.updateSupplier/);
assert.match(offline, /phase5Store\.archiveSupplier/);
assert.match(app, /DesktopCustomerMasterPanel/);
assert.doesNotMatch(app, /view==="customers"&&<CustomerList/);

assert.match(customerStore, /auditAction\("customer\.create"/);
assert.match(customerStore, /auditAction\("customer\.update"/);
assert.match(customerStore, /auditAction\("customer\.archive"/);
assert.match(supplierStore, /auditAction\("supplier\.create"/);
assert.match(supplierStore, /auditAction\("supplier\.update"/);
assert.match(supplierStore, /auditAction\("supplier\.archive"/);

console.log("Customer/supplier UI contract PASS");
