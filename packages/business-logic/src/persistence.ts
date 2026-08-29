/**
 * Domain snapshot export/import + optional auto-persist.
 */

import type {
  Customer, Product, Category, Sale, Payment, ServiceOrder, MeasurementProfile,
  LaundryOrder, Expense, Purchase, Supplier, ExpenseCategory,
  StaffMember, StaffAssignment, IncentiveRuleRecord, StaffIncentivePayout,
  AppNotification, SaleReturn, AuditLogEntry, Branch,
} from "@minarvabiz/types";
import * as store from "./store";
import * as ordersStore from "./orders-store";
import * as phase5Store from "./phase5-store";
import * as phase6Store from "./phase6-store";
import * as phase7Store from "./phase7-store";
import * as phase9Store from "./phase9-store";

export const SNAPSHOT_VERSION = 2;

export interface DomainSnapshot {
  version: number;
  exportedAt: string;
  customers: Customer[];
  products: Product[];
  categories: Category[];
  sales: Sale[];
  payments: Payment[];
  orders: ServiceOrder[];
  measurements: MeasurementProfile[];
  laundry: LaundryOrder[];
  expenses: Expense[];
  purchases: Purchase[];
  suppliers: Supplier[];
  expenseCategories: ExpenseCategory[];
  staff: StaffMember[];
  assignments: StaffAssignment[];
  incentiveRules: IncentiveRuleRecord[];
  payouts: StaffIncentivePayout[];
  notifications: AppNotification[];
  returns: SaleReturn[];
  audit: AuditLogEntry[];
  branches: Branch[];
  activeBranchId?: string | null;
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
    measurements: [], // filled via list per-customer below
    laundry: phase5Store.listLaundryOrders(),
    expenses: phase5Store.listExpenses(),
    purchases: phase5Store.listPurchases(),
    suppliers: phase5Store.listSuppliers(),
    expenseCategories: phase5Store.listExpenseCategories(),
    staff: phase6Store.listStaff(),
    assignments: phase6Store.listAssignments(),
    incentiveRules: phase6Store.listIncentiveRules(),
    payouts: phase6Store.listIncentivePayouts(),
    notifications: phase6Store.listNotifications(),
    returns: phase7Store.listReturns(),
    audit: phase7Store.listAuditLogs(500),
    branches: phase9Store.listBranches(),
    activeBranchId: phase9Store.getActiveBranch()?.id ?? null,
  };
}

/** Collect measurements for all customers */
export function exportDomainSnapshotFull(): DomainSnapshot {
  const snap = exportDomainSnapshot();
  const profiles: MeasurementProfile[] = [];
  for (const c of snap.customers) {
    profiles.push(...ordersStore.listMeasurementProfiles(c.id));
  }
  snap.measurements = profiles;
  return snap;
}

export function exportDomainSnapshotJson(): string {
  return JSON.stringify(exportDomainSnapshotFull(), null, 2);
}

export function importDomainSnapshot(snap: DomainSnapshot): {
  ok: boolean;
  error?: string;
  counts?: Record<string, number>;
} {
  if (!snap || (snap.version !== 1 && snap.version !== 2)) {
    return { ok: false, error: `Unsupported snapshot version ${snap?.version}` };
  }
  try {
    store.hydrateCore({
      customers: snap.customers,
      products: snap.products,
      categories: snap.categories,
      sales: snap.sales,
      payments: snap.payments,
    });
    ordersStore.hydrateOrders({
      orders: snap.orders,
      measurements: snap.measurements,
    });
    phase5Store.hydratePhase5({
      suppliers: snap.suppliers,
      laundryOrders: snap.laundry,
      expenses: snap.expenses,
      purchases: snap.purchases,
      expenseCategories: snap.expenseCategories,
    });
    phase6Store.hydratePhase6({
      staff: snap.staff,
      assignments: snap.assignments,
      incentiveRules: snap.incentiveRules,
      payouts: snap.payouts,
      notifications: snap.notifications,
    });
    phase7Store.hydratePhase7({
      returns: snap.returns,
      auditLogs: snap.audit,
    });
    if (snap.branches?.length) {
      phase9Store.hydratePhase9({
        branches: snap.branches,
        activeBranchId: snap.activeBranchId ?? undefined,
      });
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  return {
    ok: true,
    counts: {
      customers: snap.customers?.length ?? 0,
      products: snap.products?.length ?? 0,
      sales: snap.sales?.length ?? 0,
      orders: snap.orders?.length ?? 0,
      staff: snap.staff?.length ?? 0,
      expenses: snap.expenses?.length ?? 0,
    },
  };
}

export function importDomainSnapshotJson(json: string) {
  try {
    return importDomainSnapshot(JSON.parse(json) as DomainSnapshot);
  } catch {
    return { ok: false as const, error: "Invalid snapshot JSON" };
  }
}

const LOCAL_KEY = "minarvabiz-domain-v2";

export function saveToLocalStorage(): boolean {
  if (typeof localStorage === "undefined") return false;
  localStorage.setItem(LOCAL_KEY, exportDomainSnapshotJson());
  return true;
}

export function loadFromLocalStorage(): { ok: boolean; error?: string } {
  if (typeof localStorage === "undefined") {
    return { ok: false, error: "localStorage unavailable" };
  }
  const raw = localStorage.getItem(LOCAL_KEY);
  if (!raw) return { ok: false, error: "No saved snapshot" };
  return importDomainSnapshotJson(raw);
}

/** Debounced auto-save to localStorage after mutations */
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleAutoSave(delayMs = 800) {
  if (typeof localStorage === "undefined") return;
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    saveToLocalStorage();
  }, delayMs);
}

export function bootstrapFromLocalStorage(): boolean {
  const result = loadFromLocalStorage();
  return result.ok;
}
