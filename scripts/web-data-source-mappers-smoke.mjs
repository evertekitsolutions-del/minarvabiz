import assert from "node:assert/strict";

const mappers = await import(
  new URL("../apps/web/src/lib/data-source-mappers.ts", import.meta.url)
);

const category = mappers.mapCategory({
  id: "cat-1",
  name: "Fabric",
  is_active: true,
  branch_id: "branch-1",
});
assert.equal(category.id, "cat-1");
assert.equal(category.name, "Fabric");
assert.equal(category.isActive, true);
assert.equal(category.branchId, "branch-1");

const purchase = mappers.mapPurchase({
  id: "purchase-1",
  doc_number: "PUR-001",
  total: "125.50",
  paid: "25.50",
  balance: "100",
  kind: "order_specific",
  order_id: "order-1",
});
assert.equal(purchase.purchaseNumber, "PUR-001");
assert.equal(purchase.amount, 125.5);
assert.equal(purchase.paidAmount, 25.5);
assert.equal(purchase.balanceAmount, 100);
assert.equal(purchase.kind, "order_specific");

const journal = mappers.mapJournalEntry(
  {
    id: "journal-1",
    journal_number: "JV-001",
    total_debit: "50",
    total_credit: "50",
    status: "posted",
  },
  [
    mappers.mapJournalEntryLine({
      id: "line-1",
      journal_entry_id: "journal-1",
      account_id: "acct-1",
      account_code: "1000",
      account_name: "Cash",
      debit: "50",
      credit: "0",
    }),
  ],
);
assert.equal(journal.journalNumber, "JV-001");
assert.equal(journal.totalDebit, 50);
assert.equal(journal.totalCredit, 50);
assert.equal(journal.lines.length, 1);

console.log("Web data-source mapper regression smoke PASS");
