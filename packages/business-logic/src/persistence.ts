/**
 * Domain snapshot export/import + optional auto-persist.
 */

import type {
  Customer, Product, Category, Sale, Payment, ServiceOrder, MeasurementProfile,
  LaundryOrder, Expense, Purchase, Supplier, ExpenseCategory,
  StaffMember, StaffAssignment, IncentiveRuleRecord, StaffIncentivePayout, StaffAttendanceRecord,
  AppNotification, SaleReturn, AuditLogEntry, Branch,
} from "@minarvabiz/types";
import * as store from "./store";
import * as ordersStore from "./orders-store";
import * as phase5Store from "./phase5-store";
import * as phase6Store from "./phase6-store";
import * as phase7Store from "./phase7-store";
import * as phase9Store from "./phase9-store";
import * as phase10Store from "./phase10-operations-store";
import * as warehouseStore from "./warehouse-store";
import * as procurementStore from "./procurement-store";
import * as accountingStore from "./accounting-store";
import * as shopProfile from "./shop-profile";
import * as taxConfig from "./tax-config";
import * as autoBackup from "./auto-backup";
import * as printSettings from "./print-settings";
import * as quotationsMod from "./quotations";
import * as cashReg from "./cash-register";
import * as purchaseReturnsMod from "./purchase-returns";
import { exportOutbox, hydrateOutbox, type LocalOutboxEvent } from "./outbox-bridge";
import * as dayEnd from "./day-end";
import * as recycleBin from "./recycle-bin";
import type { ShopProfile } from "./shop-profile";
import type { TaxConfig } from "./tax-config";
import type { AutoBackupSettings, BackupMeta } from "./auto-backup";

export const SNAPSHOT_VERSION = 13;

export interface DomainSnapshot {
  version: number;
  exportedAt: string;
  customers: Customer[];
  products: Product[];
  categories: Category[];
  sales: Sale[];
  payments: Payment[];
  stockTransfers?: ReturnType<typeof store.listStockTransfers>;
  heldSales?: ReturnType<typeof store.listHeldSales>;
  orders: ServiceOrder[];
  measurements: MeasurementProfile[];
  laundry: LaundryOrder[];
  expenses: Expense[];
  purchases: Purchase[];
  suppliers: Supplier[];
  expenseCategories: ExpenseCategory[];
  staff: StaffMember[];
  attendance?: StaffAttendanceRecord[];
  assignments: StaffAssignment[];
  incentiveRules: IncentiveRuleRecord[];
  payouts: StaffIncentivePayout[];
  notifications: AppNotification[];
  returns: SaleReturn[];
  audit: AuditLogEntry[];
  branches: Branch[];
  activeBranchId?: string | null;
  shopProfile?: ShopProfile | null;
  taxConfig?: TaxConfig | null;
  autoBackup?: { settings: AutoBackupSettings; history: BackupMeta[] } | null;
  printSettings?: ReturnType<typeof printSettings.getPrintSettings> | null;
  outbox?: LocalOutboxEvent[];
  quotations?: ReturnType<typeof quotationsMod.exportQuotationsState>["quotations"];
  cashSessions?: ReturnType<typeof cashReg.exportCashRegisterState>["sessions"];
  purchaseReturns?: ReturnType<typeof purchaseReturnsMod.exportPurchaseReturnsState>["returns"];
  phase10?: ReturnType<typeof phase10Store.exportPhase10State>;
  warehouse?: ReturnType<typeof warehouseStore.exportWarehouseState>;
  procurement?: ReturnType<typeof procurementStore.exportProcurementState>;
  accounting?: ReturnType<typeof accountingStore.exportAccountingState>;
  dayEndCloses?: ReturnType<typeof dayEnd.listDayEndCloses>;
  recycleBin?: ReturnType<typeof recycleBin.exportRecycleBinState> | null;
}

export function exportDomainSnapshot(): DomainSnapshot {
  const core = store.exportCoreState();
  const phase5 = phase5Store.exportPhase5State();
  const phase6 = phase6Store.exportPhase6State();
  return {
    version: SNAPSHOT_VERSION,
    exportedAt: new Date().toISOString(),
    customers: core.customers,
    products: core.products,
    categories: core.categories,
    sales: core.sales,
    payments: core.payments,
    stockTransfers: core.stockTransfers,
    heldSales: core.heldSales,
    orders: ordersStore.listOrders(),
    measurements: [],
    laundry: phase5.laundryOrders,
    expenses: phase5.expenses,
    purchases: phase5.purchases,
    suppliers: phase5.suppliers,
    expenseCategories: phase5.expenseCategories,
    staff: phase6.staff,
    attendance: phase6.attendance,
    assignments: phase6.assignments,
    incentiveRules: phase6.incentiveRules,
    payouts: phase6.payouts,
    notifications: phase6.notifications,
    returns: phase7Store.listReturns(),
    audit: phase7Store.listAuditLogs(Number.MAX_SAFE_INTEGER),
    branches: phase9Store.listBranches(),
    activeBranchId: phase9Store.getActiveBranch()?.id ?? null,
    shopProfile: shopProfile.getShopProfile(),
    taxConfig: taxConfig.getTaxConfig(),
    autoBackup: autoBackup.exportAutoBackupState(),
    printSettings: printSettings.getPrintSettings(),
    outbox: exportOutbox(),
    quotations: quotationsMod.exportQuotationsState().quotations,
    cashSessions: cashReg.exportCashRegisterState().sessions,
    purchaseReturns: purchaseReturnsMod.exportPurchaseReturnsState().returns,
    phase10: phase10Store.exportPhase10State(),
    warehouse: warehouseStore.exportWarehouseState(),
    procurement: procurementStore.exportProcurementState(),
    accounting: accountingStore.exportAccountingState(),
    dayEndCloses: dayEnd.listDayEndCloses(),
    recycleBin: recycleBin.exportRecycleBinState(),
  };
}

export function exportDomainSnapshotFull(): DomainSnapshot {
  const snap = exportDomainSnapshot(); const profiles: MeasurementProfile[] = [];
  for (const c of snap.customers) profiles.push(...ordersStore.listMeasurementProfiles(c.id));
  snap.measurements = profiles; return snap;
}
export function exportDomainSnapshotJson(): string { return JSON.stringify(exportDomainSnapshotFull(), null, 2); }

const SUPPORTED_SNAPSHOT_VERSIONS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);

function normalizeSnapshot(input: DomainSnapshot): DomainSnapshot {
  const collection = <T>(value: T[] | undefined, field: string): T[] => {
    if (value == null) return [];
    if (!Array.isArray(value)) throw new Error(`Snapshot field "${field}" must be an array`);
    return value;
  };

  if (!input || typeof input !== "object") throw new Error("Snapshot must be a JSON object");
  if (!SUPPORTED_SNAPSHOT_VERSIONS.has(Number(input.version))) {
    throw new Error(`Unsupported snapshot version ${String(input.version)}`);
  }

  return {
    ...input,
    version: Number(input.version),
    exportedAt: typeof input.exportedAt === "string" && input.exportedAt
      ? input.exportedAt
      : new Date(0).toISOString(),
    customers: collection(input.customers, "customers"),
    products: collection(input.products, "products"),
    categories: collection(input.categories, "categories"),
    sales: collection(input.sales, "sales"),
    payments: collection(input.payments, "payments"),
    stockTransfers: collection(input.stockTransfers, "stockTransfers"),
    heldSales: collection(input.heldSales, "heldSales"),
    orders: collection(input.orders, "orders"),
    measurements: collection(input.measurements, "measurements"),
    laundry: collection(input.laundry, "laundry"),
    expenses: collection(input.expenses, "expenses"),
    purchases: collection(input.purchases, "purchases"),
    suppliers: collection(input.suppliers, "suppliers"),
    expenseCategories: collection(input.expenseCategories, "expenseCategories"),
    staff: collection(input.staff, "staff"),
    attendance: collection(input.attendance, "attendance"),
    assignments: collection(input.assignments, "assignments"),
    incentiveRules: collection(input.incentiveRules, "incentiveRules"),
    payouts: collection(input.payouts, "payouts"),
    notifications: collection(input.notifications, "notifications"),
    returns: collection(input.returns, "returns"),
    audit: collection(input.audit, "audit"),
    branches: collection(input.branches, "branches"),
    outbox: input.outbox == null ? undefined : collection(input.outbox, "outbox"),
    quotations: input.quotations == null ? undefined : collection(input.quotations, "quotations"),
    cashSessions: input.cashSessions == null ? undefined : collection(input.cashSessions, "cashSessions"),
    purchaseReturns: input.purchaseReturns == null ? undefined : collection(input.purchaseReturns, "purchaseReturns"),
    dayEndCloses: input.dayEndCloses == null ? undefined : collection(input.dayEndCloses, "dayEndCloses"),
  };
}

function applyDomainSnapshot(snap: DomainSnapshot): void {
  if (snap.outbox) hydrateOutbox(snap.outbox);
  if (snap.quotations) quotationsMod.hydrateQuotations({ quotations: snap.quotations });
  if (snap.cashSessions) cashReg.hydrateCashRegister({ sessions: snap.cashSessions });
  if (snap.purchaseReturns) purchaseReturnsMod.hydratePurchaseReturns({ returns: snap.purchaseReturns });

  store.hydrateCore({
    customers: snap.customers,
    products: snap.products,
    categories: snap.categories,
    sales: snap.sales,
    payments: snap.payments,
    stockTransfers: snap.stockTransfers,
    heldSales: snap.heldSales,
  });
  ordersStore.hydrateOrders({ orders: snap.orders, measurements: snap.measurements });
  phase5Store.hydratePhase5({
    suppliers: snap.suppliers,
    laundryOrders: snap.laundry,
    expenses: snap.expenses,
    purchases: snap.purchases,
    expenseCategories: snap.expenseCategories,
  });
  phase6Store.hydratePhase6({
    staff: snap.staff,
    attendance: snap.attendance,
    assignments: snap.assignments,
    incentiveRules: snap.incentiveRules,
    payouts: snap.payouts,
    notifications: snap.notifications,
  });
  phase7Store.hydratePhase7({ returns: snap.returns, auditLogs: snap.audit });

  if (snap.branches?.length) {
    phase9Store.hydratePhase9({ branches: snap.branches, activeBranchId: snap.activeBranchId ?? undefined });
  }
  if (snap.phase10) phase10Store.hydratePhase10(snap.phase10);
  if (snap.warehouse) warehouseStore.hydrateWarehouseState(snap.warehouse);
  if (snap.procurement) procurementStore.hydrateProcurementState(snap.procurement);
  if (snap.accounting) accountingStore.hydrateAccountingState(snap.accounting);
  if (snap.shopProfile) shopProfile.hydrateShopProfile(snap.shopProfile);
  if (snap.taxConfig) taxConfig.hydrateTaxConfig(snap.taxConfig);
  if (snap.autoBackup) autoBackup.hydrateAutoBackup(snap.autoBackup);
  if (snap.printSettings) printSettings.hydratePrintSettings(snap.printSettings);
  if (snap.dayEndCloses) dayEnd.hydrateDayEnd({ closes: snap.dayEndCloses });
  recycleBin.hydrateRecycleBinState(snap.recycleBin);
}

export function validateDomainSnapshot(snap: unknown): { ok: true; snapshot: DomainSnapshot } | { ok: false; error: string } {
  try {
    return { ok: true, snapshot: normalizeSnapshot(snap as DomainSnapshot) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function importDomainSnapshot(snap: DomainSnapshot): { ok: boolean; error?: string; counts?: Record<string, number> } {
  const validated = validateDomainSnapshot(snap);
  if (!validated.ok) return { ok: false, error: validated.error };

  const incoming = validated.snapshot;
  const rollback = exportDomainSnapshotFull();

  try {
    applyDomainSnapshot(incoming);
  } catch (error) {
    const importError = error instanceof Error ? error.message : String(error);
    try {
      applyDomainSnapshot(rollback);
    } catch (rollbackError) {
      return {
        ok: false,
        error: `Import failed: ${importError}. Automatic rollback also failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
      };
    }
    return { ok: false, error: `Import failed and was rolled back safely: ${importError}` };
  }

  return {
    ok: true,
    counts: {
      customers: incoming.customers.length,
      products: incoming.products.length,
      sales: incoming.sales.length,
      orders: incoming.orders.length,
      staff: incoming.staff.length,
      expenses: incoming.expenses.length,
      productionWorkflows: incoming.phase10?.productionWorkflows?.length ?? 0,
      materialRolls: incoming.phase10?.materialRolls?.length ?? 0,
      warehouses: incoming.warehouse?.warehouses?.length ?? 0,
      warehouseLocations: incoming.warehouse?.locations?.length ?? 0,
      accounts: incoming.accounting?.accounts?.length ?? 0,
      journals: incoming.accounting?.journals?.length ?? 0,
    },
  };
}
export function importDomainSnapshotJson(json: string) { try { return importDomainSnapshot(JSON.parse(json) as DomainSnapshot); } catch { return { ok: false as const, error: "Invalid snapshot JSON" }; } }

const LOCAL_KEY = "minarvabiz-domain-v2";
export function saveToLocalStorage(): boolean { if (typeof localStorage === "undefined") return false; localStorage.setItem(LOCAL_KEY, exportDomainSnapshotJson()); return true; }
export function loadFromLocalStorage(): { ok: boolean; error?: string } { if (typeof localStorage === "undefined") return { ok: false, error: "localStorage unavailable" }; const raw = localStorage.getItem(LOCAL_KEY); if (!raw) return { ok: false, error: "No saved snapshot" }; return importDomainSnapshotJson(raw); }
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
export function scheduleAutoSave(delayMs = 800) { if (typeof localStorage === "undefined") return; if (autoSaveTimer) clearTimeout(autoSaveTimer); autoSaveTimer = setTimeout(() => { saveToLocalStorage(); }, delayMs); }
export function bootstrapFromLocalStorage(): boolean { return loadFromLocalStorage().ok; }
