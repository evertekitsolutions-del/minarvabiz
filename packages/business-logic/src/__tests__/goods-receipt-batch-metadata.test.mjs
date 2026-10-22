import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
const ts=require("typescript");
require.extensions[".ts"]=(mod,path)=>mod._compile(
  ts.transpileModule(fs.readFileSync(path,"utf8"),{
    fileName:path,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
  }).outputText,path,
);
const {validateGoodsReceiptBatchMetadata:validate}=require("../goods-receipt-batch-metadata.ts");
const basic={receiptDate:"2026-10-22",productId:"product-1"};
test("ordinary untracked goods receipts retain legacy no-batch behavior",()=>{
  assert.equal(validate({...basic}),null);
  assert.equal(validate({...basic,batchCode:null,expiresOn:null}),null);
  assert.equal(validate({...basic,batchCode:" ",expiresOn:""}),null);
});
test("actual receipt line stores trimmed valid manufacturer batch and immutable expiry",()=>{
  assert.deepEqual(validate({...basic,batchCode:" BATCH-25_01 ",expiresOn:"2027-03-01"}),
    {batchCode:"BATCH-25_01",expiresOn:"2027-03-01"});
  assert.deepEqual(validate({...basic,batchCode:"B2",expiresOn:"2026-10-22"}),
    {batchCode:"B2",expiresOn:"2026-10-22"});
  assert.deepEqual(validate({...basic,batchCode:"Löt 4/23",expiresOn:"2027-06-05"}),
    {batchCode:"Löt 4/23",expiresOn:"2027-06-05"});
});
test("paired metadata, valid dates, linked product and printable batch code enforced",()=>{
  for(const raw of [
    {batchCode:"B1"}, {expiresOn:"2027-01-01"}, {batchCode:"B",expiresOn:"2026-10-21"},
    {batchCode:"B",expiresOn:"2026-02-30"}, {batchCode:"B",expiresOn:"2027-13-01"},
    {batchCode:"=1+1",expiresOn:"2027-12-01"}, {batchCode:"B\nX",expiresOn:"2027-12-01"},
    {batchCode:"X".repeat(65),expiresOn:"2027-12-01"}, {batchCode:" B",expiresOn:"2027-01-01",productId:null},
  ]){
    assert.throws(()=>validate({...basic,...raw}),undefined,JSON.stringify(raw));
  }
  assert.throws(()=>validate({...basic,receiptDate:"2026-02-30",batchCode:"B",expiresOn:"2027-01-01"}),/valid YYYY/);
});
test("real GRN receives the fields before stock mutation and retains them on receipt line",()=>{
  const store=fs.readFileSync(new URL("../procurement-store.ts",import.meta.url),"utf8");
  const type=fs.readFileSync(new URL("../../../types/src/index.ts",import.meta.url),"utf8");
  const start=store.indexOf("export function receivePurchaseOrder");
  const end=store.indexOf("export function listPurchaseInvoices",start);
  assert.ok(start>0&&end>start);
  const receive=store.slice(start,end);
  assert.match(receive,/validateGoodsReceiptBatchMetadata\(/);
  assert.match(receive,/batchCode: batchMetadata\.batchCode, expiresOn: batchMetadata\.expiresOn/);
  assert.ok(receive.indexOf("validateGoodsReceiptBatchMetadata")<receive.indexOf("mainStore.adjustStock("));
  assert.match(type,/batchCode\?: string \| null/);
  assert.match(type,/expiresOn\?: ISODateString \| null/);
  assert.match(store,/function cloneReceipt\([\s\S]*lines: receipt\.lines\.map\(\(line\) => \(\{ \.\.\.line \}\)\)/);
});
test("Web/Windows common GRN component captures batch only on installed desktop and displays saved provenance",()=>{
  const ui=fs.readFileSync(new URL("../../../ui/src/components/purchases/ProcurementPanel.tsx",import.meta.url),"utf8");
  const desktop=fs.readFileSync(new URL("../../../../apps/desktop/src/components/DesktopProcurementPanel.tsx",import.meta.url),"utf8");
  const web=fs.readFileSync(new URL("../../../../apps/web/src/app/(app)/purchases/page.tsx",import.meta.url),"utf8");
  assert.match(ui,/Boolean\(\(window as unknown as \{ minarvaDesktop\?: unknown \}\)\.minarvaDesktop\)/);
  assert.match(ui,/Supplier batch \/ lot code/);
  assert.match(ui,/Batch expiry date \(paired with code\)/);
  assert.match(ui,/batchCode: receiveBatch\[line\.id\]/);
  assert.match(ui,/expiresOn: receiveExpiry\[line\.id\]/);
  assert.match(ui,/receipt\.lines\.filter\(line => line\.batchCode\)/);
  assert.match(web,/procurementStore\.receivePurchaseOrder\(payload\)/);
  assert.match(desktop,/procurementStore\.receivePurchaseOrder\(payload\)/);
});
test("local procurement snapshot round-trips batch metadata without requiring migration",()=>{
  const s=fs.readFileSync(new URL("../procurement-store.ts",import.meta.url),"utf8");
  const p=fs.readFileSync(new URL("../persistence.ts",import.meta.url),"utf8");
  assert.match(s,/export function exportProcurementState\(\)/);
  assert.match(s,/goodsReceipts: listGoodsReceipts\(\)/);
  assert.match(s,/goodsReceipts\.push\(\.\.\.input\.goodsReceipts\.map\(cloneReceipt\)\)/);
  assert.match(p,/procurementStore\.exportProcurementState/);
});
