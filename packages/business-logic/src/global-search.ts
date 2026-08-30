/**
 * Global search across customers, invoices, orders, products
 */
import * as mainStore from "./store";
import * as ordersStore from "./orders-store";
import { listQuotations } from "./quotations";

export type SearchResultKind = "customer" | "sale" | "order" | "product" | "quotation";

export interface SearchResult {
  kind: SearchResultKind;
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

export function globalSearch(query: string, limit = 20): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: SearchResult[] = [];

  for (const c of mainStore.listCustomers()) {
    if (
      c.name.toLowerCase().includes(q) ||
      (c.phone || "").includes(q) ||
      (c.email || "").toLowerCase().includes(q)
    ) {
      out.push({
        kind: "customer",
        id: c.id,
        title: c.name,
        subtitle: c.phone || c.email || "Customer",
        href: "/customers",
      });
    }
    if (out.length >= limit) return out;
  }

  for (const s of mainStore.listSales()) {
    if (s.invoiceNumber.toLowerCase().includes(q) || (s.customerName || "").toLowerCase().includes(q)) {
      out.push({
        kind: "sale",
        id: s.id,
        title: s.invoiceNumber,
        subtitle: `${s.customerName || "Walk-in"} · ${s.total}`,
        href: "/sales",
      });
    }
    if (out.length >= limit) return out;
  }

  for (const o of ordersStore.listOrders()) {
    if (o.orderNumber.toLowerCase().includes(q) || (o.customerName || "").toLowerCase().includes(q)) {
      out.push({
        kind: "order",
        id: o.id,
        title: o.orderNumber,
        subtitle: `${o.customerName || ""} · ${o.status}`,
        href: "/services",
      });
    }
    if (out.length >= limit) return out;
  }

  for (const p of mainStore.listProducts()) {
    if (
      p.name.toLowerCase().includes(q) ||
      (p.sku || "").toLowerCase().includes(q) ||
      (p.barcode || "").includes(q)
    ) {
      out.push({
        kind: "product",
        id: p.id,
        title: p.name,
        subtitle: `${p.sku || ""} ${p.barcode || ""} · Stock ${p.stockQuantity}`,
        href: "/products",
      });
    }
    if (out.length >= limit) return out;
  }

  for (const qt of listQuotations()) {
    if (qt.quotationNumber.toLowerCase().includes(q) || (qt.customerName || "").toLowerCase().includes(q)) {
      out.push({
        kind: "quotation",
        id: qt.id,
        title: qt.quotationNumber,
        subtitle: `${qt.customerName || ""} · ${qt.status}`,
        href: "/quotations",
      });
    }
    if (out.length >= limit) return out;
  }

  return out;
}
