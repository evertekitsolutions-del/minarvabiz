import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const staff = source("packages/business-logic/src/phase6-store.ts");
const suppliers = source("packages/business-logic/src/phase5-store.ts");
const core = source("packages/business-logic/src/store.ts");
const runtime = source("packages/business-logic/src/runtime-mode.ts");
const bootstrap = source("apps/desktop/src/lib/sqlite-bootstrap.ts");

for (const [name, file, expr] of [
  ["staff", staff, /const staff:StaffMember\[\]=allowDemoSeed\(\) \? \[/],
  ["incentive rules", staff, /const incentiveRules:IncentiveRuleRecord\[\]=allowDemoSeed\(\) \? \[/],
  ["demo notifications", staff, /const notifications:AppNotification\[\]=allowDemoSeed\(\) \? \[/],
  ["demo suppliers", suppliers, /const suppliers: Supplier\[\] = allowDemoSeed\(\) \? \[/],
  ["customer/inventory fixtures", core, /if \(allowDemoSeed\(\)\) \{/],
]) {
  assert.match(file, expr, `Production must not seed ${name}`);
}

assert.match(runtime, /return mode === "demo" \|\| mode === "development";/);
assert.match(bootstrap, /setRuntimeMode\("production"\)/);
assert.match(staff, /export function hydratePhase6/);
assert.match(staff, /if\(input\.staff\)\{staff\.length=0/);
assert.match(suppliers, /if\(data\.suppliers\)\{suppliers\.length=0/);
assert.match(suppliers, /const expenseCategories: ExpenseCategory\[\] = \[/);
console.log("Production desktop fixture isolation smoke PASS");
