import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../procurement-store.ts", import.meta.url), "utf8");
const types = fs.readFileSync(new URL("../../../types/src/index.ts", import.meta.url), "utf8");
const persistence = fs.readFileSync(new URL("../persistence.ts", import.meta.url), "utf8");
const migration = fs.readFileSync(new URL("../../../../supabase/migrations/20260919_procurement_purchase_orders.sql", import.meta.url), "utf8");

assert.match(types, /PurchaseOrderStatus/);
assert.match(types, /receivedQuantity/);
assert.match(source, /createPurchaseOrder/);
assert.match(source, /approvePurchaseOrder/);
assert.match(source, /cancelPurchaseOrder\(id: UUID, reason: string\)/);
assert.match(source, /Cancellation reason is required/);
assert.match(source, /received quantity cannot be cancelled/);
assert.match(source, /cancellationReason/);
assert.match(source, /assertPermission\("purchases\.manage"\)/);
assert.match(source, /remoteUpsertPurchaseOrder/);
assert.match(source, /auditAction\("purchase_order\.create"/);
assert.match(persistence, /procurementStore\.exportProcurementState/);
assert.match(persistence, /procurementStore\.hydrateProcurementState/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.purchase_orders/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.purchase_order_lines/);
assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
assert.match(migration, /organization_members/);

console.log("Procurement purchase-order contract tests passed");
