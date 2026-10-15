import assert from "node:assert/strict";
import fs from "node:fs";

const services = fs.readFileSync(new URL("../apps/web/src/app/(app)/services/page.tsx", import.meta.url), "utf8");
const orderForm = fs.readFileSync(new URL("../packages/ui/src/components/orders/OrderForm.tsx", import.meta.url), "utf8");

assert.match(orderForm, /onClick=\{onAddCustomer\}/, "order customer + action must call supplied handler");
assert.match(services, /onAddCustomer=\{openCustomerQuickAdd\}/);
assert.match(services, /title="Add Customer for Service Order"/);
assert.match(services, /customerSchema\.safeParse\(/, "reuse validated customer input");
assert.match(services, /assertLimit\("customers"\)/, "respect licensed customer counts");
assert.match(services, /store\.createCustomer\(parsed\.data\)/, "real customer persistence required");
const handler = services.match(/function saveCustomerForOrder\(\) \{([\s\S]*?)\n  \}\n\n  function loadProfiles/);
assert.ok(handler, "customer save routine must remain wired");
assert.match(handler[1], /setForm\(\(current\) => \(\{\s*\.\.\.current,/);
assert.match(handler[1], /customerId: customer\.id/);
assert.match(handler[1], /measurementProfileId: ""/);
assert.match(handler[1], /measurements: \{\}/, "must not carry unrelated customer measurements");
assert.match(handler[1], /setProfiles\(\[\]\)/);
assert.match(handler[1], /setCustomerQuickAddOpen\(false\)/);
assert.match(handler[1], /refresh\(\)/);
assert.match(handler[1], /catch \(error\)/);
assert.doesNotMatch(handler[1], /setCreateOpen\(false\)/, "must keep new service order open");
assert.doesNotMatch(handler[1], /setForm\(emptyOrderForm\(\)\)/, "must preserve order draft details");
assert.match(services, /role="alert"/);
console.log("Service order quick-add customer validation and preserve-draft UI contract PASS");
