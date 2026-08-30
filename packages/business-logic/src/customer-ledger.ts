/**
 * Customer ledger / credit account statement
 */
import type { LedgerEntry, UUID } from "@minarvabiz/types";
import { generateId } from "@minarvabiz/utils";
import * as mainStore from "./store";

export interface CustomerStatement {
  customerId: UUID;
  customerName: string;
  totalSales: number;
  totalPaid: number;
  totalRefund: number;
  outstanding: number;
  advanceBalance: number;
  entries: LedgerEntry[];
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Build statement from live sales, payments, returns */
export function buildCustomerStatement(customerId: UUID): CustomerStatement | null {
  const customer = mainStore.getCustomer(customerId);
  if (!customer) return null;

  const sales = mainStore.listSales().filter((s) => s.customerId === customerId);
  const payments = mainStore.listPayments().filter((p) => p.customerId === customerId);

  let totalSales = 0;
  let totalPaid = 0;
  let totalRefund = 0;
  const entries: LedgerEntry[] = [];
  let running = 0;

  for (const s of sales) {
    totalSales = round2(totalSales + s.total);
    totalPaid = round2(totalPaid + s.paidAmount);
    running = round2(running + s.total - s.paidAmount);
    entries.push({
      id: generateId(),
      partyType: "customer",
      partyId: customerId,
      entryType: "sale",
      referenceType: "sale",
      referenceId: s.id,
      debit: s.total,
      credit: s.paidAmount,
      balanceAfter: running,
      notes: s.invoiceNumber,
      createdAt: s.saleDate,
    });
  }
  for (const p of payments) {
    if (p.referenceType === "sale") continue; // already counted in sale paid
    totalPaid = round2(totalPaid + p.amount);
    running = round2(running - p.amount);
    entries.push({
      id: p.id,
      partyType: "customer",
      partyId: customerId,
      entryType: "payment",
      referenceType: p.referenceType,
      referenceId: p.referenceId,
      debit: 0,
      credit: p.amount,
      balanceAfter: running,
      notes: p.notes || p.method,
      createdAt: p.paidAt,
    });
  }

  entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const outstanding = round2(Math.max(0, customer.outstandingBalance));
  const advanceBalance = round2(Math.max(0, -customer.outstandingBalance));

  return {
    customerId,
    customerName: customer.name,
    totalSales,
    totalPaid,
    totalRefund,
    outstanding,
    advanceBalance,
    entries,
  };
}

export function buildCustomerStatementHtml(stmt: CustomerStatement): string {
  const rows = stmt.entries
    .map(
      (e) =>
        `<tr><td>${e.createdAt.slice(0, 10)}</td><td>${e.entryType}</td><td>${e.notes || ""}</td><td>${e.debit}</td><td>${e.credit}</td><td>${e.balanceAfter}</td></tr>`
    )
    .join("");
  return `<!DOCTYPE html><html><head><title>Statement ${stmt.customerName}</title>
<style>body{font-family:system-ui;padding:16px}table{width:100%;border-collapse:collapse;font-size:13px}
td,th{border-bottom:1px solid #e2e8f0;padding:6px;text-align:left}</style></head>
<body><h1>Customer Statement</h1>
<p>${stmt.customerName}</p>
<p>Sales: ${stmt.totalSales} · Paid: ${stmt.totalPaid} · Outstanding: ${stmt.outstanding} · Advance: ${stmt.advanceBalance}</p>
<table><thead><tr><th>Date</th><th>Type</th><th>Ref</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead>
<tbody>${rows}</tbody></table>
<script>window.onload=function(){window.print()}</script></body></html>`;
}

export function printCustomerStatement(customerId: UUID) {
  const stmt = buildCustomerStatement(customerId);
  if (!stmt || typeof window === "undefined") return;
  const w = window.open("", "_blank", "width=900,height=900");
  if (!w) return;
  w.document.write(buildCustomerStatementHtml(stmt));
  w.document.close();
}
