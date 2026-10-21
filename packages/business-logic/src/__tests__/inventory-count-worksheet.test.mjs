import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(mod,file)=>mod._compile(
 ts.transpileModule(fs.readFileSync(file,"utf8"),{
   fileName:file,compilerOptions:{
    module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,
   },
 }).outputText,file);
const {createStockCountWorksheet,buildAuthorizedStockCountWorksheet}=
  require("../inventory-count-worksheet.ts");
const {setCurrentRole}=require("../permissions.ts");
const store=require("../store.ts");
const sample=(id,patch={})=>({
 id,name:"Product "+id,sku:"SKU-"+id,barcode:"CODE-"+id,unit:"pcs",
 stockQuantity:3.125,createdAt:"2026-10-01",updatedAt:"2026-10-01",
 costPrice:20,sellingPrice:30,minimumStock:2,taxRate:18,isActive:true,
 ...patch,
});
const date="2026-10-21T12:30:00.000Z";

test("CSV exports branch-ready count snapshot, blanks for actual count and no stock mutation",()=>{
 const products=[sample("two",{stockQuantity:1}),sample("one")];
 const before=JSON.stringify(products);
 const sheet=createStockCountWorksheet(products,date);
 assert.equal(sheet.includedProducts,2);
 assert.equal(sheet.snapshotAt,date);
 assert.match(sheet.csv,/Snapshot UTC,|\"Snapshot UTC\"/);
 assert.match(sheet.csv,/"SKU-one"/);
 assert.match(sheet.csv,/3\.125,"","",""/);
 assert.match(sheet.csv,/2026-10-21T12:30:00\.000Z/);
 assert.equal(sheet.csv.indexOf("SKU-one")<sheet.csv.indexOf("SKU-two"),true);
 assert.equal(JSON.stringify(products),before);
 assert.equal((sheet.csv.match(/\r\n/g)||[]).length,3);
});
test("CSV formula injection in names and SKU cannot execute in spreadsheet",()=>{
 const sheet=createStockCountWorksheet([sample("one",{
  name:"=HYPERLINK(\"https://evil.invalid\")",sku:"+CMD",stockQuantity:-2,
 })],date);
 assert.match(sheet.csv,/"'=HYPERLINK\(\"\"https:\/\/evil\.invalid\"\"\)"/);
 assert.match(sheet.csv,/"'\+CMD"/);
 assert.match(sheet.csv,/,-2,"","",""/);
});
test("archived inventory skipped, invalid count quantities and dates fail closed",()=>{
 assert.equal(createStockCountWorksheet([sample("x",{deletedAt:"2026-10-20"})],date).includedProducts,0);
 for(const quantity of [NaN,Infinity,1.0001]){
  assert.throws(()=>createStockCountWorksheet([sample("x",{stockQuantity:quantity})],date));
 }
 assert.throws(()=>createStockCountWorksheet([sample("x")],"bad"),/timestamp/);
});
test("inventory.adjust is mandatory, and foreign branch inventory is not exported",()=>{
 const before=store.exportCoreState();
 try{
   store.hydrateCore({products:[
     sample("local"),sample("foreign",{branchId:"other-branch"}),
   ]});
   setCurrentRole("cashier");
   assert.throws(()=>buildAuthorizedStockCountWorksheet(new Date(date)),/Permission denied/);
   setCurrentRole("manager");
   const sheet=buildAuthorizedStockCountWorksheet(new Date(date));
   assert.equal(sheet.includedProducts,1);
   assert.match(sheet.csv,/Product local/);
   assert.doesNotMatch(sheet.csv,/Product foreign/);
 }finally{
   setCurrentRole(null);
   store.hydrateCore(before);
 }
});
test("shared inventory list offers authorized manual Count sheet export",()=>{
 const s=fs.readFileSync(new URL("../../../ui/src/components/products/ProductList.tsx",import.meta.url),"utf8");
 assert.match(s,/Export count sheet/);
 assert.match(s,/buildAuthorizedStockCountWorksheet/);
 assert.match(s,/can\("inventory.adjust"\)/);
 assert.match(s,/createObjectURL/);
 assert.doesNotMatch(s,/adjustStockToQuantity\(/);
});
