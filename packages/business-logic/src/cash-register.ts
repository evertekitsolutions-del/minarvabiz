/**
 * Cash register — day open / close with expected vs actual cash
 */
import type { CashRegisterSession } from "@minarvabiz/types";
import { generateId, nowISO } from "@minarvabiz/utils";
import { assertPermission } from "./permissions";
import { touchPersistence } from "./autosave";
import * as mainStore from "./store";
import * as phase5 from "./phase5-store";
import { getDayEndClose, closeBusinessDay } from "./day-end";

const sessions: CashRegisterSession[] = [];

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getOpenSession(businessDate?: string): CashRegisterSession | undefined {
  const d = businessDate || today();
  return sessions.find((s) => s.businessDate === d && s.status === "open");
}

export function listCashSessions(): CashRegisterSession[] {
  return [...sessions].sort((a, b) => b.businessDate.localeCompare(a.businessDate));
}

export function openCashRegister(openingCash: number, businessDate?: string): {
  session: CashRegisterSession | null;
  error?: string;
} {
  assertPermission("payments.collect");
  const date = businessDate || today();
  if (getOpenSession(date)) return { session: null, error: "Register already open for this day" };
  if (getDayEndClose(date)) return { session: null, error: "Day already closed" };
  const session: CashRegisterSession = {
    id: generateId(),
    businessDate: date,
    openingCash: round2(openingCash),
    cashSales: 0,
    cashReceived: 0,
    cashExpenses: 0,
    cashRefunds: 0,
    expectedClosing: round2(openingCash),
    status: "open",
    openedAt: nowISO(),
  };
  sessions.push(session);
  touchPersistence();
  return { session };
}

/** Recalculate cash movements from domain for the session date */
export function refreshCashSession(businessDate?: string): CashRegisterSession | null {
  const s = getOpenSession(businessDate);
  if (!s) return null;
  const day = s.businessDate;
  const sales = mainStore.listSales().filter((x) => x.saleDate.slice(0, 10) === day);
  let cashSales = 0;
  let cashReceived = 0;
  for (const sale of sales) {
    // approximate: paid amount on cash method payments linked to sale
    cashSales = round2(cashSales + sale.total);
    cashReceived = round2(cashReceived + sale.paidAmount);
  }
  const expenses = phase5.listExpenses().filter((e) => e.date === day);
  const cashExpenses = round2(
    expenses.filter((e) => (e.paymentMethod || "cash") === "cash").reduce((a, e) => a + e.amount, 0)
  );
  s.cashSales = cashSales;
  s.cashReceived = cashReceived;
  s.cashExpenses = cashExpenses;
  s.expectedClosing = round2(s.openingCash + cashReceived - cashExpenses - (s.cashRefunds || 0));
  touchPersistence();
  return { ...s };
}

export function closeCashRegister(actualClosing: number, closedBy?: string, businessDate?: string): {
  session: CashRegisterSession | null;
  error?: string;
} {
  assertPermission("reports.view");
  const s = getOpenSession(businessDate);
  if (!s) return { session: null, error: "No open register session" };
  refreshCashSession(s.businessDate);
  s.actualClosing = round2(actualClosing);
  s.difference = round2(actualClosing - s.expectedClosing);
  s.closedAt = nowISO();
  s.closedBy = closedBy || "user";
  s.status = "closed";
  // Also mark business day closed if not already
  closeBusinessDay(s.businessDate);
  touchPersistence();
  return { session: s };
}

export function buildCashCloseHtml(s: CashRegisterSession): string {
  return `<!DOCTYPE html><html><head><title>Cash close ${s.businessDate}</title>
<style>body{font-family:system-ui;padding:16px}table{border-collapse:collapse}td{padding:6px 12px}</style></head>
<body><h1>Cash register — ${s.businessDate}</h1>
<table>
<tr><td>Opening cash</td><td>${s.openingCash}</td></tr>
<tr><td>Cash received</td><td>${s.cashReceived}</td></tr>
<tr><td>Cash expenses</td><td>${s.cashExpenses}</td></tr>
<tr><td>Cash refunds</td><td>${s.cashRefunds}</td></tr>
<tr><td><strong>Expected closing</strong></td><td>${s.expectedClosing}</td></tr>
<tr><td>Actual closing</td><td>${s.actualClosing ?? "—"}</td></tr>
<tr><td>Difference</td><td>${s.difference ?? "—"}</td></tr>
<tr><td>Closed by</td><td>${s.closedBy || "—"} at ${s.closedAt || "—"}</td></tr>
</table>
<script>window.onload=function(){window.print()}</script></body></html>`;
}

export function hydrateCashRegister(data: { sessions?: CashRegisterSession[] }) {
  if (data.sessions) {
    sessions.length = 0;
    sessions.push(...data.sessions);
  }
}

export function exportCashRegisterState() {
  return { sessions: [...sessions] };
}
