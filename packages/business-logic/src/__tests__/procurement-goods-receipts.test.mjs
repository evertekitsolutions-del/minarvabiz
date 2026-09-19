import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../procurement-store.ts", import.meta.url), "utf8");
const types = fs.readFileSync(new URL("../../../types/src/index.ts", import.meta.url), "utf8");
const persistence = fs.readFileSync(new URL("../persistence.ts", import.meta.url), "utf8");
const remote = fs.readFileSync(new URL("../remote-write.ts", import.meta.url), "utf8");
const migration = fs.readFileSync(new URL("../../../../supabase/migrations/20260919_goods_receipts.sql", import.meta.url), "utf8");

assert.match(types, /interface GoodsReceipt/);
assert.match(types, /interface GoodsReceiptLine/);
assert.match(source, /receivePurchaseOrder/);
assert.match(source, /partially_received/);
assert.match(source, /receivedQuantity/);
assert.match(source, /adjustStock\(receiptLine\.productId, "stock_in"/);
assert.match(source, /auditAction\("goods_receipt\.create"/);
assert.match(source, /remoteUpsertGoodsReceipt/);
assert.match(persistence, /SNAPSHOT_VERSION = 10/);
assert.match(persistence, /procurementStore\.exportProcurementState/);
assert.match(remote, /enqueueOutbox\("goods_receipts"/);
assert.match(remote, /enqueueOutbox\("goods_receipt_lines"/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.goods_receipts/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.goods_receipt_lines/);
assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
assert.match(migration, /organization_members/);

console.log("Procurement goods-receipt contract tests passed");
