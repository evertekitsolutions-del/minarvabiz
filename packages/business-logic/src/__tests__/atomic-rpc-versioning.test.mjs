import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync(
  new URL("../../../../supabase/migrations/20260924_atomic_sales_payment_stock_rpc.sql", import.meta.url),
  "utf8"
);
const dataSource = fs.readFileSync(
  new URL("../../../../apps/web/src/lib/data-source.ts", import.meta.url),
  "utf8"
);
const remoteWrite = fs.readFileSync(
  new URL("../remote-write.ts", import.meta.url),
  "utf8"
);
const supabaseAdapter = fs.readFileSync(
  new URL("../../../database/src/adapters/supabase.ts", import.meta.url),
  "utf8"
);

for (const fn of ["create_sale", "record_payment", "adjust_stock"]) {
  assert.match(migration, new RegExp("FUNCTION public\\." + fn + "\\("));
}
assert.match(migration, /SECURITY INVOKER/g);
assert.match(migration, /FOR UPDATE/);
assert.match(migration, /ERRCODE = '40001'/);
assert.match(migration, /version = version \+ 1/);
assert.match(migration, /REVOKE ALL ON FUNCTION public\.create_sale[\s\S]*FROM PUBLIC, anon/);
assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.create_sale[\s\S]*TO authenticated/);

assert.match(dataSource, /pgRpc<Record<string, unknown>>\(cfg, "create_sale"/);
assert.match(dataSource, /pgRpc<Record<string, unknown>>\(cfg, "record_payment"/);
assert.match(dataSource, /pgRpc<Record<string, unknown>>\(cfg, "adjust_stock"/);
assert.match(dataSource, /id=eq\.\$\{id\}&version=eq\.\$\{expectedVersion\}/);
assert.match(dataSource, /version conflict/);
assert.doesNotMatch(
  dataSource,
  /updateSaleSettlement:[\s\S]{0,500}pgUpdate<Record<string, unknown>>\(cfg, "sales", `id=eq\.\$\{sale\.id\}`/
);
assert.doesNotMatch(
  dataSource,
  /updatePurchaseSettlement:[\s\S]{0,500}pgUpdate<Record<string, unknown>>\(cfg, "purchases", `id=eq\.\$\{purchase\.id\}`/
);

assert.match(remoteWrite, /createSale\?: \(s: Sale, payments: Payment\[\], allowNegativeStock: boolean\)/);
assert.match(remoteWrite, /recordCustomerPayment\?:/);
assert.match(remoteWrite, /adjustStock\?:/);
assert.match(remoteWrite, /target\.recordCustomerPayment\(payment, settledSales\)/);

assert.match(supabaseAdapter, /optimisticMatch\(id, patch\.version, "Customer"\)/);
assert.match(supabaseAdapter, /optimisticMatch\(id, patch\.version, "Product"\)/);
assert.doesNotMatch(supabaseAdapter, /stock_quantity: next/);

console.log("atomic RPC and optimistic-version contract tests passed");
