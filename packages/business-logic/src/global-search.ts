/**
 * Global search across customers, invoices, orders, products, quotations,
 * payments, and staff.
 */
import * as mainStore from "./store";
import * as ordersStore from "./orders-store";
import * as phase6Store from "./phase6-store";
import { listQuotations } from "./quotations";

export type SearchResultKind =
  | "customer"
  | "sale"
  | "order"
  | "product"
  | "quotation"
  | "payment"
  | "staff";

export interface SearchResult {
  kind: SearchResultKind;
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

type RankedResult = SearchResult & { score: number; order: number };

function rank(query: string, title: string, haystack: string): number | null {
  const normalizedTitle = title.toLowerCase();
  const normalizedHaystack = haystack.toLowerCase();
  if (!normalizedHaystack.includes(query)) return null;
  if (normalizedTitle === query) return 0;
  if (normalizedTitle.startsWith(query)) return 1;
  return 2;
}

export function globalSearch(query: string, limit = 20): SearchResult[] {
  const q = query.trim().toLowerCase();
  const max = Math.max(1, Math.floor(limit));
  if (!q) return [];

  const out: RankedResult[] = [];
  let order = 0;
  const push = (result: SearchResult, haystack: string) => {
    const score = rank(q, result.title, haystack);
    if (score !== null) out.push({ ...result, score, order: order++ });
  };

  for (const c of mainStore.listCustomers()) {
    push(
      {
        kind: "customer",
        id: c.id,
        title: c.name,
        subtitle: c.phone || c.email || "Customer",
        href: "/customers",
      },
      `${c.name} ${c.phone || ""} ${c.whatsapp || ""} ${c.email || ""}`
    );
  }

  for (const s of mainStore.listSales()) {
    push(
      {
        kind: "sale",
        id: s.id,
        title: s.invoiceNumber,
        subtitle: `${s.customerName || "Walk-in"} · ${s.total}`,
        href: "/sales",
      },
      `${s.invoiceNumber} ${s.customerName || ""} ${s.total} ${s.notes || ""}`
    );
  }

  for (const o of ordersStore.listOrders()) {
    push(
      {
        kind: "order",
        id: o.id,
        title: o.orderNumber,
        subtitle: `${o.customerName || ""} · ${o.status}`,
        href: "/services",
      },
      `${o.orderNumber} ${o.customerName || ""} ${o.status} ${o.notes || ""}`
    );
  }

  for (const p of mainStore.listProducts()) {
    push(
      {
        kind: "product",
        id: p.id,
        title: p.name,
        subtitle: `${p.sku || ""} ${p.barcode || ""} · Stock ${p.stockQuantity}`,
        href: "/products",
      },
      `${p.name} ${p.sku || ""} ${p.barcode || ""} ${p.brand || ""} ${p.color || ""} ${p.size || ""}`
    );
  }

  for (const qt of listQuotations()) {
    push(
      {
        kind: "quotation",
        id: qt.id,
        title: qt.quotationNumber,
        subtitle: `${qt.customerName || ""} · ${qt.status}`,
        href: "/quotations",
      },
      `${qt.quotationNumber} ${qt.customerName || ""} ${qt.status}`
    );
  }

  for (const payment of mainStore.listPayments()) {
    push(
      {
        kind: "payment",
        id: payment.id,
        title: `Payment ${payment.id.slice(0, 8)}`,
        subtitle: `${payment.method} · ${payment.referenceType} · ${payment.amount}`,
        href: "/payments",
      },
      `${payment.id} ${payment.method} ${payment.referenceType} ${payment.referenceId} ${payment.customerId || ""} ${payment.amount} ${payment.notes || ""}`
    );
  }

  for (const member of phase6Store.listStaff()) {
    push(
      {
        kind: "staff",
        id: member.id,
        title: member.name,
        subtitle: `${member.role} · ${member.phone || member.email || "Staff"}`,
        href: "/staff",
      },
      `${member.name} ${member.phone || ""} ${member.email || ""} ${member.role} ${member.notes || ""}`
    );
  }

  return out
    .sort((a, b) => a.score - b.score || a.order - b.order)
    .slice(0, max)
    .map(({ score: _score, order: _order, ...result }) => result);
}
