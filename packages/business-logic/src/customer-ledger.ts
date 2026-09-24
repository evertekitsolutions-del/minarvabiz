/**
 * Customer ledger / credit account statement
 */
import type { LedgerEntry, UUID } from "@minarvabiz/types";
import { addMinorUnits, fromMinorUnits, generateId, subtractMinorUnits, toMinorUnits, type MoneyMinor } from "@minarvabiz/utils";
import * as mainStore from "./store";
import { escapeHtml } from "./html";

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

/** Build statement from live sales, payments, returns */
export function buildCustomerStatement(customerId: UUID): CustomerStatement | null {
  const customer = mainStore.getCustomer(customerId);
  if (!customer) return null;

  const sales = mainStore.listSales().filter((s) => s.customerId === customerId);
  const payments = mainStore.listPayments().filter((p) => p.customerId === customerId);

  let totalSalesMinor: MoneyMinor = 0;
  let totalPaidMinor: MoneyMinor = 0;
  const totalRefundMinor: MoneyMinor = 0;
  const entries: LedgerEntry[] = [];
  let runningMinor: MoneyMinor = 0;

  for (const s of sales) {
    const saleTotalMinor = toMinorUnits(s.total);
    const salePaidMinor = toMinorUnits(s.paidAmount);
    totalSalesMinor = addMinorUnits(totalSalesMinor, saleTotalMinor);
    totalPaidMinor = addMinorUnits(totalPaidMinor, salePaidMinor);
    runningMinor = addMinorUnits(runningMinor, subtractMinorUnits(saleTotalMinor, salePaidMinor));
    entries.push({
      id: generateId(),
      partyType: "customer",
      partyId: customerId,
      entryType: "sale",
      referenceType: "sale",
      referenceId: s.id,
      debit: s.total,
      credit: s.paidAmount,
      balanceAfter: fromMinorUnits(runningMinor),
      notes: s.invoiceNumber,
      createdAt: s.saleDate,
    });
  }
  for (const p of payments) {
    if (p.referenceType === "sale") continue; // already counted in sale paid
    const paymentMinor = toMinorUnits(p.amount);
    totalPaidMinor = addMinorUnits(totalPaidMinor, paymentMinor);
    runningMinor = subtractMinorUnits(runningMinor, paymentMinor);
    entries.push({
      id: p.id,
      partyType: "customer",
      partyId: customerId,
      entryType: "payment",
      referenceType: p.referenceType,
      referenceId: p.referenceId,
      debit: 0,
      credit: p.amount,
      balanceAfter: fromMinorUnits(runningMinor),
      notes: p.notes || p.method,
      createdAt: p.paidAt,
    });
  }

  entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const customerBalanceMinor = toMinorUnits(customer.outstandingBalance);
  const outstanding = fromMinorUnits(Math.max(0, customerBalanceMinor));
  const advanceBalance = fromMinorUnits(Math.max(0, -customerBalanceMinor));

  return {
    customerId,
    customerName: customer.name,
    totalSales: fromMinorUnits(totalSalesMinor),
    totalPaid: fromMinorUnits(totalPaidMinor),
    totalRefund: fromMinorUnits(totalRefundMinor),
    outstanding,
    advanceBalance,
    entries,
  };
}

export function buildCustomerStatementHtml(stmt: CustomerStatement): string {
  const rows = stmt.entries
    .map(
      (e) =>
        `<tr><td>${escapeHtml(e.createdAt.slice(0, 10))}</td><td>${escapeHtml(e.entryType)}</td><td>${escapeHtml(e.notes || "")}</td><td>${e.debit}</td><td>${e.credit}</td><td>${e.balanceAfter}</td></tr>`
    )
    .join("");
  return `<!DOCTYPE html><html><head><title>Statement ${escapeHtml(stmt.customerName)}</title>
<style>body{font-family:system-ui;padding:16px}table{width:100%;border-collapse:collapse;font-size:13px}
td,th{border-bottom:1px solid #e2e8f0;padding:6px;text-align:left}</style></head>
<body><h1>Customer Statement</h1>
<p>${escapeHtml(stmt.customerName)}</p>
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
