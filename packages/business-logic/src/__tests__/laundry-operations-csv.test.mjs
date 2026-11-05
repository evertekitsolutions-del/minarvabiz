import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url),ts=require("typescript");
require.extensions[".ts"]=(mod,file)=>mod._compile(ts.transpileModule(fs.readFileSync(file,"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}
}).outputText,file);
const {buildLaundryOperationsReport}=require("../laundry-operations-report.ts");
const {exportLaundryOperationsCsv}=require("../laundry-operations-csv.ts");

test("export reuses monthly report exactly, retaining stage and service counts",()=>{
  const orders=[{
    id:"l1",createdAt:"2026-11-02T12:00:00Z",mode:"outsourced",status:"received",quantity:2,
    dueAt:"2026-11-03",totalCustomerCharge:100,totalSupplierCost:40,
    items:[{quantity:2,serviceCode:"dry_clean",processingStatus:"quality_check",qualityStatus:"failed"}],
  },{
    id:"l2",createdAt:"2026-11-04T12:00:00Z",mode:"in_house_ironing",status:"delivered",quantity:1,
    totalCustomerCharge:35,totalSupplierCost:0,
    items:[{quantity:1,serviceCode:"steam_iron",processingStatus:"delivered",qualityStatus:"passed"}],
  }];
  const source=JSON.stringify(orders);
  const report=buildLaundryOperationsReport(orders,"2026-11-01","2026-11-30","2026-11-05");
  const csv=exportLaundryOperationsCsv(report);
  assert.match(csv,/section,metric,count,amount,tickets\r\n/);
  assert.match(csv,/ticket,booked,2,,\r\n/);
  assert.match(csv,/ticket,overdue_open,1,,\r\n/);
  assert.match(csv,/booking_financial,booked_customer_charge,,135,\r\n/);
  assert.match(csv,/booking_financial,supplier_commitment,,40,\r\n/);
  assert.match(csv,/processing_stage,quality_check,2,,\r\n/);
  assert.match(csv,/service_volume,dry_clean,2,,1\r\n/);
  assert.match(csv,/service_volume,steam_iron,1,,1\r\n/);
  assert.match(csv,/not the reconciled finance ledger/i);
  assert.equal(JSON.stringify(orders),source);
});
test("spreadsheet formula injection and special characters are escaped",()=>{
  const report=buildLaundryOperationsReport([{
    id:"attack",createdAt:"2026-11-02",mode:"outsourced",status:"pending",quantity:1,
    totalCustomerCharge:0,totalSupplierCost:0,
    items:[{quantity:1,serviceCode:'  =HYPERLINK("http://evil")\r\n',processingStatus:"received",qualityStatus:"pending"}],
  }],"2026-11-01","2026-11-30","2026-11-05");
  const csv=exportLaundryOperationsCsv(report);
  assert.match(csv,/service_volume,"'  =HYPERLINK\(""http:\/\/evil""\)\r\n",1,,1/);
});
test("invalid reporting period and unsafe values reject instead of exporting",()=>{
  const zero=buildLaundryOperationsReport([],"2026-11-01","2026-11-30","2026-11-05");
  assert.throws(()=>exportLaundryOperationsCsv({...zero,through:"1900-01-01"}),/period/);
  assert.throws(()=>exportLaundryOperationsCsv({...zero,bookedTickets:NaN}),/invalid numeric/);
});
test("shared desktop/web operations UI exposes monthly CSV download",()=>{
  const ui=fs.readFileSync(new URL("../../../ui/src/components/laundry/LaundryOperationsPanel.tsx",import.meta.url),"utf8");
  assert.match(ui,/exportLaundryOperationsCsv/);
  assert.match(ui,/Export month CSV/);
  assert.match(ui,/URL\.revokeObjectURL/);
  assert.match(ui,/exportFeedback/);
});
