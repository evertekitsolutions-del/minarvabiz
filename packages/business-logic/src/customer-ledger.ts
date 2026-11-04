/**
 * Customer ledger / credit account statement
 */
import type { LedgerEntry, UUID } from "@minarvabiz/types";
import { addMinorUnits, fromMinorUnits, subtractMinorUnits, toMinorUnits, type MoneyMinor } from "@minarvabiz/utils";
import * as tailoring from "./orders-store";
import * as laundry from "./phase5-store";
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
  /** Difference between recorded charge/payment events and authoritative customer balance. No automatic journal adjustment is made. */
  reconciliationDifference: number;
}

/** Reconstruct the customer statement from actual charge and payment source records.
 * This is a read-only audit: historical/opening inconsistencies are disclosed, never posted as fake adjustments.
 */
export function buildCustomerStatement(customerId: UUID): CustomerStatement | null {
  const customer = mainStore.getCustomer(customerId);
  if (!customer) return null;

  const entries: LedgerEntry[] = [];
  let totalCharges: MoneyMinor = 0;
  let totalPaid: MoneyMinor = 0;
  let totalRefund: MoneyMinor = 0;

  function append(entryType: LedgerEntry["entryType"], referenceType: string, referenceId: string,
    createdAt: string, notes: string, debitMinor: MoneyMinor, creditMinor: MoneyMinor) {
    entries.push({
      id: "statement:" + referenceType + ":" + referenceId + ":" + entryType,
      partyType: "customer", partyId: customerId, entryType, referenceType, referenceId,
      debit: fromMinorUnits(debitMinor), credit: fromMinorUnits(creditMinor),
      balanceAfter: 0, notes, createdAt,
    });
  }

  for (const sale of mainStore.listSales()) {
    if (sale.customerId !== customerId) continue;
    const amount = toMinorUnits(sale.total);
    totalCharges = addMinorUnits(totalCharges, amount);
    append("sale", "sale", sale.id, sale.saleDate, sale.invoiceNumber, amount, 0);
    if (sale.status === "cancelled" || sale.status === "returned") {
      append("adjustment", "sale_return", sale.id, sale.updatedAt,
        "Reversed " + sale.invoiceNumber + " (" + sale.status + ")", 0, amount);
    }
  }

  for (const order of tailoring.listOrders({ customerId })) {
    if (order.status === "cancelled") continue;
    const amount = addMinorUnits(toMinorUnits(order.advance), toMinorUnits(order.balance));
    totalCharges = addMinorUnits(totalCharges, amount);
    append("sale", "order", order.id, order.orderDate, "Tailoring: " + order.orderNumber, amount, 0);
  }

  for (const order of laundry.listLaundryOrders({ customerId })) {
    if (order.status === "cancelled") continue;
    const amount = toMinorUnits(order.totalCustomerCharge);
    totalCharges = addMinorUnits(totalCharges, amount);
    append("sale", "laundry", order.id, order.createdAt, "Laundry: " + order.orderNumber, amount, 0);
  }

  // Include every receipt exactly once, including at-sale/advance payments.
  // The sale/order paidAmount fields are cumulative and must not be counted again.
  for (const payment of mainStore.listPayments()) {
    if (payment.customerId !== customerId) continue;
    const amount = toMinorUnits(payment.amount);
    if (payment.referenceType === "refund") {
      totalRefund = addMinorUnits(totalRefund, amount);
      append("refund", "refund", payment.id, payment.paidAt, payment.notes || "Refund", amount, 0);
    } else {
      totalPaid = addMinorUnits(totalPaid, amount);
      append("payment", payment.referenceType, payment.id, payment.paidAt,
        payment.notes || ("Payment via " + payment.method), 0, amount);
    }
  }

  entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt)
    || (a.entryType === "sale" ? -1 : b.entryType === "sale" ? 1 : 0)
    || a.id.localeCompare(b.id));
  let running: MoneyMinor = 0;
  for (const entry of entries) {
    running = addMinorUnits(running, subtractMinorUnits(toMinorUnits(entry.debit), toMinorUnits(entry.credit)));
    entry.balanceAfter = fromMinorUnits(running);
  }

  const balance = toMinorUnits(customer.outstandingBalance);
  return {
    customerId, customerName: customer.name,
    totalSales: fromMinorUnits(totalCharges), totalPaid: fromMinorUnits(totalPaid),
    totalRefund: fromMinorUnits(totalRefund),
    outstanding: fromMinorUnits(Math.max(0, balance)),
    advanceBalance: fromMinorUnits(Math.max(0, -balance)),
    entries,
    reconciliationDifference: fromMinorUnits(subtractMinorUnits(balance, running)),
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
<p>Charges: ${stmt.totalSales} · Receipts: ${stmt.totalPaid} · Refunds: ${stmt.totalRefund} · Outstanding: ${stmt.outstanding} · Advance: ${stmt.advanceBalance}</p>
${stmt.reconciliationDifference ? `<p style="color:#b91c1c"><strong>Unreconciled historical/opening difference: ${stmt.reconciliationDifference}</strong>. Review the underlying source documents. No balancing journal has been created.</p>` : ""}
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
