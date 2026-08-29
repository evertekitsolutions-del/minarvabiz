/**
 * Domain snapshot export/import — bridges in-memory stores to durable adapters.
 * Call exportDomainSnapshot() before shutdown; importDomainSnapshot() on boot.
 */

import type {
  Customer, Product, Category, Sale, Payment,
} from "@minarvabiz/types";
import * as store from "./store";
import * as ordersStore from "./orders-store";
import * as phase5Store from "./phase5-store";
import * as phase6Store from "./phase6-store";
import * as phase7Store from "./phase7-store";
import type { ServiceOrder, LaundryOrder, Expense, Purchase, Supplier, StaffMember, SaleReturn, AuditLogEntry, Branch } from "@minarvabiz/types";
import * as phase9Store from "./phase9-store";

export const SNAPSHOT_VERSION = 1;

export interface DomainSnapshot {
  version: number;
  exportedAt: string;
  customers: Customer[];
  products: Product[];
  categories: Category[];
  sales: Sale[];
  payments: Payment[];
  orders: ServiceOrder[];
  laundry: LaundryOrder[];
  expenses: Expense[];
  purchases: Purchase[];
  suppliers: Supplier[];
  staff: StaffMember[];
  returns: SaleReturn[];
  audit: AuditLogEntry[];
  branches: Branch[];
}

export function exportDomainSnapshot(): DomainSnapshot {
  return {
    version: SNAPSHOT_VERSION,
    exportedAt: new Date().toISOString(),
    customers: store.listCustomers(),
    products: store.listProducts(),
    categories: store.listCategories(),
    sales: store.listSales(),
    payments: store.listPayments(),
    orders: ordersStore.listOrders(),
    laundry: phase5Store.listLaundryOrders(),
    expenses: phase5Store.listExpenses(),
    purchases: phase5Store.listPurchases(),
    suppliers: phase5Store.listSuppliers(),
    staff: phase6Store.listStaff(),
    returns: phase7Store.listReturns(),
    audit: phase7Store.listAuditLogs(500),
    branches: phase9Store.listBranches(),
  };
}

export function exportDomainSnapshotJson(): string {
  return JSON.stringify(exportDomainSnapshot(), null, 2);
}

/**
 * Import is conservative: replaces lists via store-level hydrate helpers when available.
 * Full replace requires hydrate APIs on each store — registered below.
 */
type Hydrator = (snap: DomainSnapshot) => void;
const hydrators: Hydrator[] = [];

export function registerHydrator(fn: Hydrator) {
  hydrators.push(fn);
}

export function importDomainSnapshot(snap: DomainSnapshot): {
  ok: boolean;
  error?: string;
  counts?: Record<string, number>;
} {
  if (!snap || snap.version !== SNAPSHOT_VERSION) {
    return { ok: false, error: `Unsupported snapshot version ${snap?.version}` };
  }
  for (const h of hydrators) {
    try {
      h(snap);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  return {
    ok: true,
    counts: {
      customers: snap.customers.length,
      products: snap.products.length,
      sales: snap.sales.length,
      orders: snap.orders.length,
      staff: snap.staff.length,
    },
  };
}

export function importDomainSnapshotJson(json: string) {
  try {
    const snap = JSON.parse(json) as DomainSnapshot;
    return importDomainSnapshot(snap);
  } catch {
    return { ok: false as const, error: "Invalid snapshot JSON" };
  }
}

// Register core hydrator
registerHydrator((snap) => {
  store.hydrateCore({
    customers: snap.customers,
    products: snap.products,
    categories: snap.categories,
    sales: snap.sales,
    payments: snap.payments,
  });
});
