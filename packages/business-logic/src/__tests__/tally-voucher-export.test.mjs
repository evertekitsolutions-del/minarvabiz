import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url), ts=require("typescript");
require.extensions[".ts"]=(m,file)=>m._compile(ts.transpileModule(fs.readFileSync(file,"utf8"),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
}).outputText,file);
const {buildTallyPrimeVoucherImportXml}=require("../tally-voucher-export.ts");
const journal=(id,overrides={})=>({
  id,journalNumber:"J-"+id,entryDate:"2026-11-03",status:"posted",
  description:"Monthly laundry <&> income",totalDebit:125.25,totalCredit:125.25,
  branchId:"branch-hq",voidedAt:null,createdAt:"2026-11-03T10:00:00Z",updatedAt:"2026-11-03T10:00:00Z",
  lines:[
    {id:id+"-d",accountId:"cash",accountCode:"101",accountName:"Cash & Bank",debit:125.25,credit:0},
    {id:id+"-c",accountId:"revenue",accountCode:"401",accountName:"Laundry <Services>",debit:0,credit:125.25},
  ],...overrides,
});
const config={
  companyName:"Minarva < & Co",from:"2026-11-01",through:"2026-11-30",
  branchId:"branch-hq",headquartersBranchId:"branch-hq",
};

test("Tally XML follows Vouchers import envelope and accounting debit-negative sign convention",()=>{
  const before=JSON.stringify(journal("one"));
  const data=buildTallyPrimeVoucherImportXml([journal("one")],config);
  assert.equal(data.voucherCount,1);
  assert.match(data.xml,/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(data.xml,/<TALLYREQUEST>Import<\/TALLYREQUEST><TYPE>Data<\/TYPE><ID>Vouchers<\/ID>/);
  assert.match(data.xml,/<SVCURRENTCOMPANY>Minarva &lt; &amp; Co<\/SVCURRENTCOMPANY>/);
  assert.match(data.xml,/<DATE>20261103<\/DATE>/);
  assert.match(data.xml,/<VOUCHERTYPENAME>Journal<\/VOUCHERTYPENAME>/);
  assert.match(data.xml,/<LEDGERNAME>Cash &amp; Bank<\/LEDGERNAME><ISDEEMEDPOSITIVE>Yes<\/ISDEEMEDPOSITIVE><AMOUNT>-125\.25<\/AMOUNT>/);
  assert.match(data.xml,/<LEDGERNAME>Laundry &lt;Services&gt;<\/LEDGERNAME><ISDEEMEDPOSITIVE>No<\/ISDEEMEDPOSITIVE><AMOUNT>125\.25<\/AMOUNT>/);
  assert.match(data.xml,/Minarva source one/);
  assert(!data.xml.includes("Monthly laundry <&>"));
  assert.equal(JSON.stringify(journal("one")),before);
});
test("drafts, voided journals, unrelated branches and out-of-range dates never leak into export",()=>{
  const raw=[
    journal("hq",{branchId:null}),journal("b2",{branchId:"branch-two"}),
    journal("draft",{status:"draft"}),journal("void",{voidedAt:"2026-11-04"}),
    journal("other",{entryDate:"2026-10-31"}),
  ];
  const res=buildTallyPrimeVoucherImportXml(raw,config);
  assert.equal(res.voucherCount,1);
  assert.match(res.xml,/MB-J-hq/);
  assert(!res.xml.includes("MB-J-b2"));
  assert(!res.xml.includes("MB-J-draft"));
  assert(!res.xml.includes("MB-J-void"));
  const remote=buildTallyPrimeVoucherImportXml(raw,{...config,branchId:"branch-two"});
  assert.equal(remote.voucherCount,1);
  assert.match(remote.xml,/MB-J-b2/);
  assert(!remote.xml.includes("MB-J-hq"));
});
test("ledger name mapping requires existing target ledger and escapes mapped text",()=>{
  const data=buildTallyPrimeVoucherImportXml([journal("one")],{
    ...config,ledgerNamesByAccountCode:{"101":"Current Bank A&B","401":"Laundry Services"},
  });
  assert.match(data.xml,/<LEDGERNAME>Current Bank A&amp;B<\/LEDGERNAME>/);
  assert.match(data.xml,/<LEDGERNAME>Laundry Services<\/LEDGERNAME>/);
  assert.throws(()=>buildTallyPrimeVoucherImportXml([journal("one")],{
    ...config,ledgerNamesByAccountCode:{"101":"  "},
  }),/ledger name/i);
});
test("invalid journal totals, mixed debit/credit, duplicate vouchers and control characters fail closed",()=>{
  const bad=[journal("one",{totalCredit:100}),journal("one",{lines:[
    {...journal("one").lines[0],credit:10},journal("one").lines[1],
  ]})];
  for(const item of bad)assert.throws(()=>buildTallyPrimeVoucherImportXml([item],config),/journal/i);
  assert.throws(()=>buildTallyPrimeVoucherImportXml([journal("one"),journal("one")],config),/duplicate/i);
  assert.throws(()=>buildTallyPrimeVoucherImportXml([journal("one",{description:"bad\u0001text"})],config),/invalid XML/i);
  assert.throws(()=>buildTallyPrimeVoucherImportXml([journal("one",{entryDate:"2026-11-31"})],{
    ...config,through:"2026-12-31",
  }),/date/i);
  assert.throws(()=>buildTallyPrimeVoucherImportXml([journal("one",{lines:[{
    ...journal("one").lines[0],debit:125.251,
  },journal("one").lines[1]]})],config),/two-decimal/i);
});
test("no-activity, unknown target company or invalid branch configuration refuses misleading file",()=>{
  assert.throws(()=>buildTallyPrimeVoucherImportXml([],config),/no posted/i);
  assert.throws(()=>buildTallyPrimeVoucherImportXml([journal("one")],{...config,companyName:""}),/company name/i);
  assert.throws(()=>buildTallyPrimeVoucherImportXml([journal("one")],{...config,branchId:"branch-two",headquartersBranchId:null}),/headquarters/i);
  assert.throws(()=>buildTallyPrimeVoucherImportXml([journal("one")],{...config,through:"2026-01-01"}),/date range/i);
});
test("manual export is wired in shared accounting journal UI, with zero HTTP side effects",()=>{
  const accounting=fs.readFileSync(new URL("../../../ui/src/components/accounting/AccountingPanel.tsx",import.meta.url),"utf8");
  const panel=fs.readFileSync(new URL("../../../ui/src/components/accounting/TallyPrimeExportPanel.tsx",import.meta.url),"utf8");
  assert.match(accounting,/TallyPrimeExportPanel journals=\{journals\}/);
  assert.match(panel,/buildTallyPrimeVoucherImportXml/);
  assert.match(panel,/assertPermission\("accounting\.view"\)/);
  assert.match(panel,/URL\.revokeObjectURL/);
  assert.match(panel,/Alt\+O/);
});
