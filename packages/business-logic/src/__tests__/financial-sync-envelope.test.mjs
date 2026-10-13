import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, filename) => mod._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename, compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    },
  }).outputText, filename,
);
const { buildSaleFinancialEnvelope, prepareSaleFinancialStockProof } = require("../financial-sync-envelope.ts");

const IDS = {
  org: "10000000-0000-4000-8000-000000000001",
  user: "10000000-0000-4000-8000-000000000002",
  branch: "10000000-0000-4000-8000-000000000003",
  warehouse: "10000000-0000-4000-8000-000000000004",
  location: "10000000-0000-4000-8000-000000000005",
  device: "10000000-0000-4000-8000-000000000006",
  product: "10000000-0000-4000-8000-000000000007",
  sale: "10000000-0000-4000-8000-000000000008",
  cash: "10000000-0000-4000-8000-000000000009",
  card: "10000000-0000-4000-8000-000000000010",
  saleEvent: "10000000-0000-4000-8000-000000000011",
  cashEvent: "10000000-0000-4000-8000-000000000012",
  cardEvent: "10000000-0000-4000-8000-000000000013",
  journal: "10000000-0000-4000-8000-000000000014",
  cashAccount: "10000000-0000-4000-8000-000000000015",
  clearingAccount: "10000000-0000-4000-8000-000000000016",
  salesAccount: "10000000-0000-4000-8000-000000000017",
  journalLine1: "10000000-0000-4000-8000-000000000018",
  journalLine2: "10000000-0000-4000-8000-000000000019",
  journalLine3: "10000000-0000-4000-8000-000000000020",
  item: "10000000-0000-4000-8000-000000000021",
};
const scope = IDS.org + ":" + IDS.user;
const date = "2026-10-13T12:00:00.000Z";

function fixture() {
  const sale = {
    id: IDS.sale, invoiceNumber: "INV-S1", saleDate: date, branchId: IDS.branch,
    deviceId: IDS.device, version: 1,
    customerId: null, customerName: null, subtotal: 125, discountAmount: 0,
    taxAmount: 0, total: 125, paidAmount: 125, balanceAmount: 0, status: "completed",
    createdAt: date, updatedAt: date,
    items: [{ id: IDS.item, saleId: IDS.sale, productId: IDS.product, productName: "Material",
      quantity: 1.25, unitPrice: 100, costPrice: 0, discountPercent: 0, taxRate: 0, lineTotal: 125 }],
  };
  const payments = [
    { id: IDS.cash, amount: 80, method: "cash", referenceType: "sale", referenceId: IDS.sale,
      branchId: IDS.branch, deviceId: IDS.device, paidAt: date, createdAt: date, version: 1 },
    { id: IDS.card, amount: 45, method: "card", referenceType: "sale", referenceId: IDS.sale,
      branchId: IDS.branch, deviceId: IDS.device, paidAt: date, createdAt: date, version: 1 },
  ];
  const accounts = [
    { id: IDS.cashAccount, code:"1000", name:"Cash",type:"asset",normalBalance:"debit",version:1 },
    { id: IDS.clearingAccount, code:"1020", name:"Clearing",type:"asset",normalBalance:"debit",version:1 },
    { id: IDS.salesAccount, code:"4000", name:"Product Sales",type:"income",normalBalance:"credit",version:1 },
  ];
  const journal = { id: IDS.journal, journalNumber: "JV-S1", entryDate:date,
    referenceType:"auto_sale", referenceId:IDS.sale, branchId:IDS.branch,
    status:"posted", totalDebit:125, totalCredit:125, version:1,
    lines:[
      { id:IDS.journalLine1, journalEntryId:IDS.journal, accountId:IDS.cashAccount,
        accountCode:"1000", accountName:"Cash", debit:80, credit:0 },
      { id:IDS.journalLine2, journalEntryId:IDS.journal, accountId:IDS.clearingAccount,
        accountCode:"1020", accountName:"Clearing", debit:45, credit:0 },
      { id:IDS.journalLine3, journalEntryId:IDS.journal, accountId:IDS.salesAccount,
        accountCode:"4000", accountName:"Product Sales", debit:0, credit:125 },
    ],
  };
  const event = (id, aggregateType, aggregateId, payload, sequence) => ({
    id, aggregateType, aggregateId, eventType:"insert", payload,
    deviceId:IDS.device, occurredAt:date, ownerScope:scope, sequence,
    status:"pending", attempts:0, lastError:null,
  });
  const saleEvent = event(IDS.saleEvent,"sales",IDS.sale,structuredClone(sale),14);
  saleEvent.financialSyncProof = {
    schemaVersion:1, currencyCode:"USD", currencyExponent:2,
    branchId:IDS.branch, warehouseId:IDS.warehouse, locationId:IDS.location,
    expectedVersions:{[IDS.product]:8},
    stockLines:[{productId:IDS.product,quantity:1.25,expectedProductVersion:8,
      priorProductStock:7.5, resultingProductStock:6.25,
      expectedWarehouseVersion:4, priorOnHand:5, resultingOnHand:3.75,
      warehouseId:IDS.warehouse,locationId:IDS.location}],
    paymentEventIds:[IDS.cashEvent,IDS.cardEvent], journalId:IDS.journal,
  };
  return { version:15, exportedAt:date, sales:[sale], payments, accounting:{accounts,journals:[journal]},
    products:[{id:IDS.product,name:"Material",stockQuantity:6.25,version:9,branchId:IDS.branch}],
    warehouse:{warehouses:[{id:IDS.warehouse,branchId:IDS.branch,isActive:true}],
      locations:[{id:IDS.location,warehouseId:IDS.warehouse,isActive:true}],
      stock:[{id:"10000000-0000-4000-8000-000000000022",productId:IDS.product,
        warehouseId:IDS.warehouse,locationId:IDS.location,onHand:3.75,reserved:0,version:5}]},
    outbox:[saleEvent,event(IDS.cashEvent,"payments",IDS.cash,structuredClone(payments[0]),15),
      event(IDS.cardEvent,"payments",IDS.card,structuredClone(payments[1]),16)] };
}

test("complete immutable sale/payment/journal/stock graph produces one S1 envelope", () => {
  const snap = fixture();
  const original = structuredClone(snap);
  const result = buildSaleFinancialEnvelope(snap, IDS.saleEvent, scope);
  assert.equal(result.operation, "sale.post");
  assert.equal(result.eventId, IDS.saleEvent);
  assert.equal(result.organizationId, IDS.org);
  assert.equal(result.deviceId, IDS.device);
  assert.equal(result.sequence, 14);
  assert.equal(result.payments.length, 2);
  assert.equal(result.journal.id, IDS.journal);
  assert.equal(result.accounts.length, 3);
  assert.equal(result.expectedVersions[IDS.product], 8);
  assert.equal(result.currencyCode, "USD");
  assert.equal(result.currencyExponent, 2);
  assert.equal(result.stockLines[0].priorOnHand, 5);
  assert.deepEqual(snap, original, "builder must not mutate any live/snapshot data");
  assert.notStrictEqual(result.sale, snap.sales[0], "envelope must detach mutation aliases");
});

test("legacy sale lacking immutable pre-operation authority remains held", () => {
  const snap=fixture();
  delete snap.outbox[0].financialSyncProof;
  assert.equal(buildSaleFinancialEnvelope(snap,IDS.saleEvent,scope).held,"missing_pre_operation_authority");
});

test("missing one payment event never manufactures an accepted split-tender envelope", () => {
  const snap=fixture();
  snap.outbox.pop();
  assert.match(buildSaleFinancialEnvelope(snap,IDS.saleEvent,scope).held,/payment|dependency/i);
});

test("missing posted journal and missing account each hold the whole sale", () => {
  const snap=fixture();
  snap.accounting.journals=[];
  assert.match(buildSaleFinancialEnvelope(snap,IDS.saleEvent,scope).held,/journal/i);
  const next=fixture();
  next.accounting.accounts.pop();
  assert.match(buildSaleFinancialEnvelope(next,IDS.saleEvent,scope).held,/account/i);
});

test("no payload, org or source revision mismatch can be projected", () => {
  const snap=fixture();
  snap.outbox[1].ownerScope="20000000-0000-4000-8000-000000000001:other";
  assert.ok("held" in buildSaleFinancialEnvelope(snap,IDS.saleEvent,scope));
  const next=fixture();
  next.outbox[0].payload.total=126;
  assert.ok("held" in buildSaleFinancialEnvelope(next,IDS.saleEvent,scope));
});

test("incorrect balances or source journal lines are rejected before cloud preparation", () => {
  const snap=fixture();
  snap.accounting.journals[0].lines[1].debit=44;
  assert.match(buildSaleFinancialEnvelope(snap,IDS.saleEvent,scope).held,/journal|balance|amount/i);
  const second=fixture();
  second.payments[1].amount=46;
  assert.match(buildSaleFinancialEnvelope(second,IDS.saleEvent,scope).held,/payment|amount|settlement/i);
});

test("ambiguous or foreign stock locations and invalid versions stay held", () => {
  const snap=fixture();
  snap.outbox[0].financialSyncProof.stockLines[0].warehouseId="30000000-0000-4000-8000-000000000001";
  assert.ok("held" in buildSaleFinancialEnvelope(snap,IDS.saleEvent,scope));
  const second=fixture();
  second.outbox[0].financialSyncProof.expectedVersions[IDS.product]=0;
  assert.ok("held" in buildSaleFinancialEnvelope(second,IDS.saleEvent,scope));
});

test("unsupported currency exponent fails closed; never silently round three-decimal currencies", () => {
  const snap=fixture();
  snap.outbox[0].financialSyncProof.currencyCode="OMR";
  snap.outbox[0].financialSyncProof.currencyExponent=3;
  assert.match(buildSaleFinancialEnvelope(snap,IDS.saleEvent,scope).held,/currency|precision/i);
});

test("corrupt, unrelated, repeated IDs and invalid device sequences stay held", () => {
  const snap=fixture();
  snap.outbox[0].sequence=-1;
  assert.ok("held" in buildSaleFinancialEnvelope(snap,IDS.saleEvent,scope));
  const dup=fixture();
  dup.outbox.push(structuredClone(dup.outbox[0]));
  assert.ok("held" in buildSaleFinancialEnvelope(dup,IDS.saleEvent,scope));
  const wrong=fixture();
  wrong.outbox[0].financialSyncProof.paymentEventIds=[IDS.cashEvent,IDS.cashEvent];
  assert.ok("held" in buildSaleFinancialEnvelope(wrong,IDS.saleEvent,scope));
});

test("capture pre-sale warehouse and product versions without mutating existing checkout data", () => {
  const snap=fixture();
  const beforeStock=structuredClone(snap.warehouse);
  const beforeProducts=[{...snap.products[0],version:8,stockQuantity:7.5}];
  beforeStock.stock[0].onHand=5;
  beforeStock.stock[0].version=4;
  const input={sale:snap.sales[0],products:beforeProducts,warehouse:beforeStock,currencyCode:"USD"};
  const original=structuredClone(input);
  const proof=prepareSaleFinancialStockProof(input);
  assert.equal(proof.expectedVersions[IDS.product],8);
  assert.equal(proof.stockLines[0].priorOnHand,5);
  assert.equal(proof.stockLines[0].expectedWarehouseVersion,4);
  assert.deepEqual(input,original);
  const restored={...input,warehouse:{...beforeStock,stock:[]}};
  assert.equal(prepareSaleFinancialStockProof(restored),null,"unallocated stock must stay held");
});

test("multi-location or unknown branch checkout never invents authority", () => {
  const snap=fixture();
  const pre=snap.warehouse;
  pre.stock[0].onHand=5; pre.stock[0].version=4;
  const products=[{...snap.products[0],version:8,stockQuantity:7.5}];
  assert.equal(prepareSaleFinancialStockProof({
    sale:{...snap.sales[0],branchId:null},products,warehouse:pre,currencyCode:"USD",
  }),null);
  const duplicated=structuredClone(pre);
  duplicated.stock.push({...duplicated.stock[0],id:"10000000-0000-4000-8000-000000000023"});
  assert.equal(prepareSaleFinancialStockProof({
    sale:snap.sales[0],products,warehouse:duplicated,currencyCode:"USD",
  }),null);
});

export { fixture, IDS, scope };
