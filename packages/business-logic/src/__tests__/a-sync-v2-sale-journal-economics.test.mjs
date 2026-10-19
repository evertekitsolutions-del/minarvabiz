import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, file) => mod._compile(
  ts.transpileModule(fs.readFileSync(file, "utf8"), {
    fileName:file,
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
  }).outputText,file,
);
const { buildSaleFinancialEnvelope } = require("../financial-sync-envelope.ts");
const { fixture, IDS, scope } = await import("./financial-sync-envelope.test.mjs");

function project(snapshot) {
  snapshot.outbox[0].payload = structuredClone(snapshot.sales[0]);
  return buildSaleFinancialEnvelope(snapshot, IDS.saleEvent, scope);
}
const assertHeld = snapshot => {
  const before = structuredClone(snapshot);
  const result = project(snapshot);
  assert.equal(result.held,"sale_journal_economics_conflict",JSON.stringify(result));
  assert.deepEqual(snapshot.outbox.map(e => e.status),["pending","pending","pending"]);
  assert.deepEqual(snapshot.sales,before.sales);
};

test("legitimate cash plus card split still creates one detached sale/posting envelope", () => {
  const snap = fixture();
  const result = project(snap);
  assert.equal(result.operation,"sale.post",JSON.stringify(result));
  assert.equal(result.payments.length,2);
  assert.equal(result.journal.lines.length,3);
});

test("balanced journal routing 80 cash + 45 card into only cash is held", () => {
  const snap = fixture();
  snap.accounting.journals[0].lines[0].debit = 125;
  snap.accounting.journals[0].lines[1].debit = 0;
  assertHeld(snap);
});

test("swapped cash/card debits are held even when both totals and receipt sum match", () => {
  const snap = fixture();
  snap.accounting.journals[0].lines[0].debit = 45;
  snap.accounting.journals[0].lines[1].debit = 80;
  assertHeld(snap);
});

test("a journal that hides a paid sale as an outstanding receivable is held", () => {
  const snap = fixture();
  const arId = "10000000-0000-4000-8000-000000000031";
  snap.accounting.accounts.push({
    id:arId,code:"1100",name:"Receivable",systemKey:"accounts_receivable",
    type:"asset",normalBalance:"debit",version:1,
  });
  const entry = snap.accounting.journals[0];
  entry.lines[0].debit = 40; // cash must have received 80
  entry.lines.push({
    id:"10000000-0000-4000-8000-000000000032",journalEntryId:entry.id,
    accountId:arId,accountCode:"1100",accountName:"Receivable",debit:40,credit:0,
  });
  assertHeld(snap);
});

test("a balanced but reclassified tax revenue ledger cannot sync", () => {
  const snap = fixture();
  snap.accounting.journals[0].lines[2].credit = 120;
  const taxId = "10000000-0000-4000-8000-000000000033";
  snap.accounting.accounts.push({
    id:taxId,code:"2100",name:"Tax payable",systemKey:"tax_payable",
    type:"liability",normalBalance:"credit",version:1,
  });
  snap.accounting.journals[0].lines.push({
    id:"10000000-0000-4000-8000-000000000034",
    journalEntryId:IDS.journal,accountId:taxId,accountCode:"2100",
    accountName:"Tax payable",debit:0,credit:5,
  });
  assertHeld(snap);
});

test("cost of goods and inventory credit must agree with actual sold item costs", () => {
  const snap = fixture();
  snap.sales[0].items[0].costPrice = 20; // 1.25 items = 25 in cost of goods
  const cogsId="10000000-0000-4000-8000-000000000035";
  const inventoryId="10000000-0000-4000-8000-000000000036";
  snap.accounting.accounts.push(
    {id:cogsId,code:"5000",name:"COGS",systemKey:"cogs",type:"expense"},
    {id:inventoryId,code:"1200",name:"Inventory",systemKey:"inventory_asset",type:"asset"},
  );
  const entry=snap.accounting.journals[0];
  entry.lines.push(
    {id:"10000000-0000-4000-8000-000000000037",journalEntryId:entry.id,
      accountId:cogsId,accountCode:"5000",accountName:"COGS",debit:25,credit:0},
    {id:"10000000-0000-4000-8000-000000000038",journalEntryId:entry.id,
      accountId:inventoryId,accountCode:"1200",accountName:"Inventory",debit:0,credit:25},
  );
  entry.totalDebit = 150;
  entry.totalCredit = 150;
  assert.equal(project(snap).operation,"sale.post");
  entry.lines[3].debit=20;
  entry.lines[4].credit=20;
  entry.totalDebit=145;
  entry.totalCredit=145;
  assertHeld(snap);
});

test("legitimate partially collected sale retains exact receivable rather than failing closed", () => {
  const snap=fixture();
  snap.sales[0].paidAmount=40;
  snap.sales[0].balanceAmount=85;
  snap.payments.splice(1);
  snap.payments[0].amount=40;
  snap.outbox.splice(2);
  snap.outbox[0].financialSyncProof.paymentEventIds=[IDS.cashEvent];
  snap.outbox[1].payload=structuredClone(snap.payments[0]);
  const arId="10000000-0000-4000-8000-000000000039";
  snap.accounting.accounts.push({
    id:arId,code:"1100",name:"Receivable",systemKey:"accounts_receivable",type:"asset",
  });
  const entry=snap.accounting.journals[0];
  entry.lines[0].debit=40;
  entry.lines.splice(1,1);
  entry.lines.push({
    id:"10000000-0000-4000-8000-000000000040",journalEntryId:entry.id,
    accountId:arId,accountCode:"1100",accountName:"Receivable",debit:85,credit:0,
  });
  const result=project(snap);
  assert.equal(result.operation,"sale.post",JSON.stringify(result));
  assert.equal(result.sale.balanceAmount,85);
  assert.equal(result.payments.length,1);
});
