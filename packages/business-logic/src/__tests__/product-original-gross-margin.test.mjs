import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
const ts=require("typescript");
require.extensions[".ts"]=(mod,filename)=>mod._compile(
  ts.transpileModule(fs.readFileSync(filename,"utf8"),{
    fileName:filename,
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
  }).outputText,filename);
const {calculateProductOriginalGrossMargins,listAuthorizedProductOriginalGrossMargins}=
  require("../product-original-gross-margin.ts");
const {setCurrentRole}=require("../permissions.ts");
const store=require("../store.ts");

function sale(id,items,overrides={}) {
  const totals=items.reduce((a,l)=>{
    const taxable=Math.round(l.quantity*l.unitPrice*(1-(l.discountPercent??0)/100)*100)/100;
    const tax=Math.round(taxable*(l.taxRate??0)/100*100)/100;
    return {sub:a.sub+l.quantity*l.unitPrice,discount:a.discount+l.quantity*l.unitPrice*(l.discountPercent??0)/100,tax:a.tax+tax,total:a.total+taxable+tax};
  },{sub:0,discount:0,tax:0,total:0});
  return {
    id,invoiceNumber:"INV-"+id,saleDate:"2026-10-21T10:00:00Z",
    status:"completed",createdAt:"2026-10-21T10:00:00Z",version:1,
    subtotal:totals.sub,discountAmount:totals.discount,taxAmount:totals.tax,
    total:totals.total,items:items.map((l,n)=>({
      id:id+"-"+n,saleId:id,productId:l.productId,
      productName:l.productName||l.productId,sku:l.sku||null,
      quantity:l.quantity,unitPrice:l.unitPrice,costPrice:l.costPrice,
      discountPercent:l.discountPercent??0,taxRate:l.taxRate??0,
      lineTotal:Math.round((l.quantity*l.unitPrice*(1-(l.discountPercent??0)/100)*
        (1+(l.taxRate??0)/100))*100)/100,
    })),...overrides,
  };
}

test("product original margin groups duplicate SKU measured cuts and invoices",()=>{
  const sales=[
    sale("a",[
      {productId:"one",productName:"One",sku:"P-1",quantity:2,costPrice:40,unitPrice:100,taxRate:18},
      {productId:"one",productName:"One",quantity:1,costPrice:50,unitPrice:100,taxRate:18},
      {productId:"two",productName:"Two",quantity:1,costPrice:110,unitPrice:100,taxRate:0},
    ]),
    sale("b",[{productId:"one",productName:"One",quantity:1,costPrice:25,unitPrice:100,taxRate:18}]),
  ];
  const rows=calculateProductOriginalGrossMargins(sales);
  assert.equal(rows.length,2);
  const item=rows.find(r=>r.productId==="one");
  assert.deepEqual(item,{
    productId:"one",productName:"One",sku:"P-1",invoiceCount:2,soldQuantity:4,
    revenueExcludingTax:400,historicalCostOfGoods:155,
    originalGrossProfit:245,originalGrossMarginPercent:61.25,
  });
  assert.equal(rows.find(r=>r.productId==="two").originalGrossProfit,-10);
});

test("discount, milli quantities, date range and zero-tax sales",()=>{
  const s=sale("a",[{productId:"one",quantity:2.5,costPrice:20,unitPrice:100,discountPercent:10,taxRate:0}]);
  const [row]=calculateProductOriginalGrossMargins([s]);
  assert.equal(row.soldQuantity,2.5);
  assert.equal(row.revenueExcludingTax,225);
  assert.equal(row.historicalCostOfGoods,50);
  assert.equal(row.originalGrossProfit,175);
  assert.equal(calculateProductOriginalGrossMargins([s],"2026-10-22").length,0);
  for(const [from,to] of [["2026-02-30",undefined],["2026-11-01","2026-10-01"],["bad",undefined]]) {
    assert.throws(()=>calculateProductOriginalGrossMargins([s],from,to));
  }
});
test("invalid invoice totals or unallocated discounts cannot corrupt product margin",()=>{
  const s=sale("a",[{productId:"one",quantity:1,costPrice:40,unitPrice:100,taxRate:18}]);
  assert.throws(()=>calculateProductOriginalGrossMargins([{...s,total:999}]),/inconsistent/);
  assert.throws(()=>calculateProductOriginalGrossMargins([{...s,discountAmount:10,total:108}]),/not line-allocated/);
  assert.throws(()=>calculateProductOriginalGrossMargins([{...s,items:[{...s.items[0],lineTotal:100}]}]),/line total/);
  assert.throws(()=>calculateProductOriginalGrossMargins([{...s,items:[{...s.items[0],quantity:1.0001}]}]),/precision/);
  const excluded=[
    {...s,status:"draft"},{...s,status:"returned"},{...s,status:"cancelled"},
    {...s,deletedAt:"2026-10-22"},
  ];
  assert.equal(calculateProductOriginalGrossMargins(excluded).length,0);
});
test("cashier/staff denied at domain layer; branch isolation prevents foreign-profit disclosure",()=>{
  store.hydrateCore({sales:[sale("valid",[
    {productId:"one",quantity:1,costPrice:40,unitPrice:100,taxRate:0},
  ])]});
  try {
    for(const role of ["cashier","staff","tailor"]){
      setCurrentRole(role);
      assert.throws(()=>listAuthorizedProductOriginalGrossMargins(),/Permission denied/);
    }
    for(const role of ["admin","manager","super_admin"]){
      setCurrentRole(role);
      assert.equal(listAuthorizedProductOriginalGrossMargins()[0].originalGrossProfit,60);
    }
    store.hydrateCore({sales:[sale("foreign",[
      {productId:"one",quantity:1,costPrice:40,unitPrice:100,taxRate:0},
    ],{branchId:"foreign-branch"})]});
    setCurrentRole("manager");
    assert.deepEqual(listAuthorizedProductOriginalGrossMargins(),[]);
  }finally{
    setCurrentRole(null);
    store.hydrateCore({sales:[]});
  }
});
test("product margin report is permission gated and keeps exports inside role boundary",()=>{
 const s=fs.readFileSync(new URL("../../../ui/src/components/reports/ReportsPanel.tsx",import.meta.url),"utf8");
 assert.match(s,/product-profit/);
 assert.match(s,/mayReadProductMargins = can\("accounting.view"\)/);
 assert.match(s,/listAuthorizedProductOriginalGrossMargins/);
 assert.match(s,/Original posted invoice product gross margin/);
});
