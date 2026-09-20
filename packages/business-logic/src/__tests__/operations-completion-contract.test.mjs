import assert from "node:assert/strict";
import fs from "node:fs";

const remote = fs.readFileSync(new URL("../remote-write.ts", import.meta.url), "utf8");
const phase5 = fs.readFileSync(new URL("../phase5-store.ts", import.meta.url), "utf8");
const phase10 = fs.readFileSync(new URL("../phase10-operations-store.ts", import.meta.url), "utf8");
const sync = fs.readFileSync(new URL("../../../sync/src/supabase-adapter.ts", import.meta.url), "utf8");
const productionPage = fs.readFileSync(new URL("../../../../apps/web/src/app/(app)/services/production/page.tsx", import.meta.url), "utf8");

assert.match(remote, /createPurchase\?: \(p: Purchase\) => Promise<void>/);
assert.match(remote, /export async function remoteCreatePurchase\(p: Purchase, supplier\?: Supplier\)/);
assert.match(phase5, /void remoteCreatePurchase\(purchase, supplier\)/);
assert.match(phase10, /export function createMaterialRoll/);
assert.match(phase10, /export function consumeMaterialFromRoll/);
assert.match(sync, /production_workflows/);
assert.match(sync, /material_rolls/);
assert.match(sync, /function remoteRow/);
assert.match(productionPage, /ProductionBoard/);
assert.match(productionPage, /Receive material roll/);
assert.match(productionPage, /Active material rolls/);

console.log("operations completion contract tests passed");
