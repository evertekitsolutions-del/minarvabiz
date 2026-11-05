import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url), ts = require("typescript");
require.extensions[".ts"] = (mod, file) => mod._compile(ts.transpileModule(fs.readFileSync(file, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, file);
const phase9 = require("../phase9-store.ts");
const { exportLaundryVendorWorklistCsv } = require("../laundry-vendor-worklist.ts");
const stamp = "2026-11-05T00:00:00.000Z";
const HQ = "hq", OTHER = "branch-other";
const branches = [
  {id:HQ,name:"HQ",code:"HQ",isHeadquarters:true,isActive:true,createdAt:stamp,updatedAt:stamp},
  {id:OTHER,name:"Other",code:"OTHER",isHeadquarters:false,isActive:true,createdAt:stamp,updatedAt:stamp},
];
function branch(id) { phase9.hydratePhase9({branches,activeBranchId:id}); }
function ticket(id, extras={}) {
  return {
    id, orderNumber:"L-"+id, branchId:HQ, mode:"outsourced", status:"sent",
    supplierId:"s1", supplierName:"Supplier A", quantity:2,
    garment:"Shirt", dueAt:"2026-11-09T10:00:00.000Z",
    items:[{id:"one",tagCode:"G001",label:"Silk Shirt",quantity:2,serviceCode:"dry_clean",
      processingStatus:"washing",qualityStatus:"pending"}],
    ...extras,
  };
}
test("supplier worksheet is active-branch only, garment-level and stable without mutating tickets",()=>{
  branch(HQ);
  const records=[
    ticket("a"),ticket("b",{branchId:OTHER}),ticket("c",{status:"delivered"}),
    ticket("d",{status:"cancelled"}),ticket("e",{mode:"in_house_ironing"}),
    ticket("a",{orderNumber:"DUPLICATE"}),
    ticket("f",{branchId:null,items:[],quantity:3,garment:"Suit"}),
    ticket("g",{deletedAt:stamp}),
  ];
  const before=JSON.stringify(records);
  const csv=exportLaundryVendorWorklistCsv(records);
  const lines=csv.trim().split("\r\n");
  assert.equal(lines.length,3);
  assert.match(csv,/L-a,G001,Silk Shirt,2,dry_clean,washing,pending,2026-11-09,sent/);
  assert.match(csv,/L-f,,Suit,3,,,,2026-11-09,sent/);
  assert.doesNotMatch(csv,/L-b|L-c|L-d|L-e|DUPLICATE|L-g/);
  assert.equal(JSON.stringify(records),before);
  branch(OTHER);
  assert.match(exportLaundryVendorWorklistCsv(records),/L-b/);
  assert.doesNotMatch(exportLaundryVendorWorklistCsv(records),/L-a|L-f/);
});
test("worklist escapes spreadsheet formula injection and CSV newlines",()=>{
  branch(HQ);
  const csv=exportLaundryVendorWorklistCsv([ticket("x",{
    supplierName:"=HYPERLINK(\"evil\")",items:[{
      id:"i",tagCode:"TAG",label:" +cmd\nShirt",quantity:1,serviceCode:"steam_iron",
      processingStatus:"received",qualityStatus:"failed",
    }],
  })]);
  assert.match(csv,/'=HYPERLINK\(""evil""\)/);
  assert.match(csv,/"' \+cmd\nShirt"/);
});
test("refuses invalid quantity and absent active branch",()=>{
  branch(HQ);
  assert.throws(()=>exportLaundryVendorWorklistCsv([ticket("x",{items:[{tagCode:"T",label:"Shirt",quantity:NaN}]} )]),/quantity/);
  assert.throws(()=>exportLaundryVendorWorklistCsv([ticket("x",{quantity:-1,items:[]})]),/quantity/);
  assert.throws(()=>exportLaundryVendorWorklistCsv({}),/input/);
  phase9.hydratePhase9({branches:[],activeBranchId:null});
  assert.throws(()=>exportLaundryVendorWorklistCsv([ticket("a")]),/active branch/);
});
test("shared Windows and Web laundry list wires user-triggered worksheet download",()=>{
  const ui=fs.readFileSync(new URL("../../../ui/src/components/laundry/LaundryList.tsx",import.meta.url),"utf8");
  assert.match(ui,/exportLaundryVendorWorklistCsv/);
  assert.match(ui,/Export vendor worklist/);
  assert.match(ui,/URL\.revokeObjectURL/);
});
