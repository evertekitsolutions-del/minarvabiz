import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url), ts=require("typescript");
require.extensions[".ts"]=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
}).outputText,filename);

const { createSupabaseCloudAdapter } = require("../supabase-adapter.ts");

const calls=[];
const saleUpdatedAt="2026-09-22T01:02:03.000Z";
const client={
  async insert(){ return {error:null}; },
  async update(){ return {error:null}; },
  async select(table,query){
    calls.push({table,query});
    if(table==="sales") return {data:[{id:"sale-1",invoice_number:"INV-1",updated_at:saleUpdatedAt,version:2}],error:null};
    if(table==="sale_items") return {data:[{id:"item-1",sale_id:"sale-1",product_name:"Dress",quantity:1,unit_price:100,cost_price:60,line_total:100}],error:null};
    if(table==="payments") return {data:[{id:"pay-1",amount:50,method:"cash",reference_type:"other",reference_id:"cust-1",created_at:"2026-09-22T01:03:00.000Z",version:1}],error:null};
    if(table==="inventory_transactions") return {data:[{id:"move-1",product_id:"p-1",quantity:1,created_at:"2026-09-22T01:04:00.000Z"}],error:null};
    if(table==="order_expenses") return {data:[{id:"oe-1",order_id:"o-1",amount:10,created_at:"2026-09-22T01:05:00.000Z"}],error:null};
    if(table==="audit_logs") return {data:[{id:"audit-1",action:"test",created_at:"2026-09-22T01:06:00.000Z"}],error:null};
    if(table==="goods_receipts") return {data:[{id:"grn-1",grn_number:"GRN-1",created_at:"2026-09-22T01:07:00.000Z"}],error:null};
    if(table==="goods_receipt_lines") return {data:[{id:"grnl-1",goods_receipt_id:"grn-1",created_at:"2026-09-22T01:08:00.000Z"}],error:null};
    if(table==="customers") return {data:[{id:"cust-1",name:"A",updated_at:"2026-09-22T01:09:00.000Z",version:3}],error:null};
    return {data:[],error:null};
  }
};

const adapter=createSupabaseCloudAdapter(client,"device-1");
const since="2026-09-22T00:00:00.000Z";
const pulled=await adapter.pull(since,"device-1");

const query=(table)=>calls.find(c=>c.table===table)?.query ?? "";
for(const table of ["payments","inventory_transactions","order_expenses","audit_logs","goods_receipts","goods_receipt_lines"]){
  assert.match(query(table),/created_at=gt\./,table+" must use created_at cursor");
  assert.match(query(table),/order=created_at\.asc/,table+" must order by created_at");
}
assert.match(query("customers"),/updated_at=gt\./);
assert.match(query("customers"),/order=updated_at\.asc/);

const saleItemCalls=calls.filter(c=>c.table==="sale_items");
assert.equal(saleItemCalls.length,1);
assert.match(saleItemCalls[0].query,/sale_id=in\.\(sale-1\)/);
assert.doesNotMatch(saleItemCalls[0].query,/updated_at|created_at/);

const payment=pulled.records.find(x=>x.tableName==="payments");
assert(payment); assert.equal(payment.record.updatedAt,"2026-09-22T01:03:00.000Z");

const item=pulled.records.find(x=>x.tableName==="sale_items");
assert(item); assert.equal(item.record.id,"item-1"); assert.equal(item.record.updatedAt,saleUpdatedAt); assert.equal(item.record.version,1);

const sale=pulled.records.find(x=>x.tableName==="sales");
assert(sale); assert.equal(sale.record.updatedAt,saleUpdatedAt); assert.equal(sale.record.version,2);

console.log("Supabase pull cursors: append-only created_at, mutable updated_at, parent-driven sale_items PASS");
