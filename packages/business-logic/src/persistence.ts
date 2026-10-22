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
import * as holidayCache from "./holiday-cache";
import * as phase7Store from "./phase7-store";
import * as phase9Store from "./phase9-store";
import * as phase10Store from "./phase10-operations-store";
import * as warehouseStore from "./warehouse-store";
import * as batchExpiry from "./batch-expiry-register";
import * as grnBatches from "./grn-batch-attribution";
import * as lotCounts from "./local-lot-counts";
import * as serialCustody from "./serial-custody-register";
import * as serviceWarranty from "./service-warranty-register";
import * as siteVisits from "./service-site-visit-register";
import * as procurementStore from "./procurement-store";
import * as accountingStore from "./accounting-store";
import * as commerceTierDrafts from "./commerce-tier-drafts";
import * as commerceKitRecipes from "./commerce-kit-recipes";
import * as shopProfile from "./shop-profile";
import * as onboarding from "./onboarding";
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
import { parseDimensionLineMetadata } from "./dimensional-billing";
import { toQuantityMilli, QUANTITY_MILLI_FACTOR } from "@minarvabiz/utils";
import type { TaxConfig } from "./tax-config";
import type { AutoBackupSettings, BackupMeta } from "./auto-backup";

export const SNAPSHOT_VERSION = 15;

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
  attendance?: ReturnType<typeof phase6Store.exportPhase6State>["attendance"];
  shiftRules?: ReturnType<typeof phase6Store.exportPhase6State>["shiftRules"];
  rosterSlots?: ReturnType<typeof phase6Store.exportPhase6State>["rosterSlots"];
  holidayRules?: ReturnType<typeof holidayCache.exportHolidayCache>;
  assignments: StaffAssignment[];
  incentiveRules: IncentiveRuleRecord[];
  payouts: StaffIncentivePayout[];
  notifications: AppNotification[];
  returns: SaleReturn[];
  audit: AuditLogEntry[];
  branches: Branch[];
  activeBranchId?: string | null;
  shopProfile?: ShopProfile | null;
  onboardingCompletedIds?: string[];
  taxConfig?: TaxConfig | null;
  autoBackup?: { settings: AutoBackupSettings; history: BackupMeta[] } | null;
  printSettings?: ReturnType<typeof printSettings.getPrintSettings> | null;
  outbox?: LocalOutboxEvent[];
  quotations?: ReturnType<typeof quotationsMod.exportQuotationsState>["quotations"];
  cashSessions?: ReturnType<typeof cashReg.exportCashRegisterState>["sessions"];
  purchaseReturns?: ReturnType<typeof purchaseReturnsMod.exportPurchaseReturnsState>["returns"];
  phase10?: ReturnType<typeof phase10Store.exportPhase10State>;
  warehouse?: ReturnType<typeof warehouseStore.exportWarehouseState>;
  /** Offline-only lot expiry metadata; not authoritative warehouse stock. */
  batchExpiryReminders?: ReturnType<typeof batchExpiry.exportBatchExpiryReminders>;
  /** Posted GRN batch trace metadata, Windows local only. */
  grnBatchAttributions?: ReturnType<typeof grnBatches.exportGrnBatchAttributions>;
  /** Offline counted lot metadata; never an authorized live inventory ledger. */
  localLotCounts?: ReturnType<typeof lotCounts.exportLocalLotCounts>;
  /** Offline-only serial custody records; no automatic sale/GRN posting. */
  serialCustody?: ReturnType<typeof serialCustody.exportSerialCustodyRecords>;
  serviceWarranty?: ReturnType<typeof serviceWarranty.exportServiceWarrantyState>;
  /** Offline field visits, not GPS or synced customer notifications. */
  serviceSiteVisits?: ReturnType<typeof siteVisits.exportServiceSiteVisits>;
  procurement?: ReturnType<typeof procurementStore.exportProcurementState>;
  accounting?: ReturnType<typeof accountingStore.exportAccountingState>;
  /** Offline-only seller pricebook drafts. Never an authoritative checkout tariff. */
  commerceTierDrafts?: ReturnType<typeof commerceTierDrafts.exportCommerceTierDrafts>;
  /** Local-only reusable kit recipes; not sellable bundles or checkout. */
  commerceKitRecipes?: ReturnType<typeof commerceKitRecipes.exportCommerceKitRecipes>;
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
    shiftRules: phase6.shiftRules,
    rosterSlots: phase6.rosterSlots,
    holidayRules: holidayCache.exportHolidayCache(),
    assignments: phase6.assignments,
    incentiveRules: phase6.incentiveRules,
    payouts: phase6.payouts,
    notifications: phase6.notifications,
    returns: phase7Store.listReturns(),
    audit: phase7Store.listAuditLogs(Number.MAX_SAFE_INTEGER),
    branches: phase9Store.listBranches(),
    activeBranchId: phase9Store.getActiveBranch()?.id ?? null,
    shopProfile: shopProfile.getShopProfile(),
    onboardingCompletedIds: onboarding.exportOnboardingIds(),
    taxConfig: taxConfig.getTaxConfig(),
    autoBackup: autoBackup.exportAutoBackupState(),
    printSettings: printSettings.getPrintSettings(),
    outbox: exportOutbox(),
    quotations: quotationsMod.exportQuotationsState().quotations,
    cashSessions: cashReg.exportCashRegisterState().sessions,
    purchaseReturns: purchaseReturnsMod.exportPurchaseReturnsState().returns,
    phase10: phase10Store.exportPhase10State(),
    warehouse: warehouseStore.exportWarehouseState(),
    batchExpiryReminders: batchExpiry.exportBatchExpiryReminders(),
    grnBatchAttributions: grnBatches.exportGrnBatchAttributions(),
    localLotCounts: lotCounts.exportLocalLotCounts(),
    serialCustody: serialCustody.exportSerialCustodyRecords(),
    serviceWarranty: serviceWarranty.exportServiceWarrantyState(),
    serviceSiteVisits: siteVisits.exportServiceSiteVisits(),
    procurement: procurementStore.exportProcurementState(),
    accounting: accountingStore.exportAccountingState(),
    commerceTierDrafts: commerceTierDrafts.exportCommerceTierDrafts(),
    commerceKitRecipes: commerceKitRecipes.exportCommerceKitRecipes(),
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

const SUPPORTED_SNAPSHOT_VERSIONS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);

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

  // Windows offline SQLite stores this complete domain snapshot as JSON.
  // Validate every dimensional invoice BEFORE replacing any existing state;
  // malformed metadata must not be partially applied or silently discarded.
  const sales = collection(input.sales, "sales").map(sale => {
    if (!sale || typeof sale !== "object") {
      throw new Error("Snapshot sale must be an object");
    }
    // Pre-dimensional backups can omit the child collection entirely.
    // Do not invent a new mandatory field for historic snapshots.
    if (sale.items == null) return sale;
    if (!Array.isArray(sale.items)) {
      throw new Error("Snapshot sale items must be an array");
    }
    let dimensionFound = false;
    const items = sale.items.map(item => {
      if (!item || typeof item !== "object") {
        throw new Error("Snapshot sale item must be an object");
      }
      if (Object.hasOwn(item, "dimension_metadata")) {
        throw new Error("Snapshot dimensional sale metadata must use the canonical camelCase field");
      }
      if (item.dimensionMetadata == null) return item;
      dimensionFound = true;
      const milli = toQuantityMilli(item.quantity);
      if (!Number.isFinite(item.quantity) ||
          Math.abs(milli / QUANTITY_MILLI_FACTOR - item.quantity) > 1e-9) {
        throw new Error("Snapshot dimension quantity has invalid precision");
      }
      return {
        ...item,
        dimensionMetadata: parseDimensionLineMetadata(item.dimensionMetadata, milli),
      };
    });
    return dimensionFound ? { ...sale, items } : sale;
  });

  return {
    ...input,
    version: Number(input.version),
    exportedAt: typeof input.exportedAt === "string" && input.exportedAt
      ? input.exportedAt
      : new Date(0).toISOString(),
    customers: collection(input.customers, "customers"),
    products: collection(input.products, "products"),
    categories: collection(input.categories, "categories"),
    sales,
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
    shiftRules: collection(input.shiftRules, "shiftRules"),
    rosterSlots: collection(input.rosterSlots, "rosterSlots"),
    holidayRules: holidayCache.validateHolidayCache(collection(input.holidayRules, "holidayRules")),
    assignments: collection(input.assignments, "assignments"),
    incentiveRules: collection(input.incentiveRules, "incentiveRules"),
    payouts: collection(input.payouts, "payouts"),
    notifications: collection(input.notifications, "notifications"),
    returns: collection(input.returns, "returns"),
    audit: collection(input.audit, "audit"),
    branches: collection(input.branches, "branches"),
    onboardingCompletedIds: onboarding.validateOnboardingIds(input.onboardingCompletedIds ?? []),
    outbox: input.outbox == null ? undefined : collection(input.outbox, "outbox"),
    quotations: input.quotations == null ? undefined : collection(input.quotations, "quotations"),
    cashSessions: input.cashSessions == null ? undefined : collection(input.cashSessions, "cashSessions"),
    purchaseReturns: input.purchaseReturns == null ? undefined : collection(input.purchaseReturns, "purchaseReturns"),
    dayEndCloses: input.dayEndCloses == null ? undefined : collection(input.dayEndCloses, "dayEndCloses"),
    commerceTierDrafts: commerceTierDrafts.validateCommerceTierDrafts(input.commerceTierDrafts ?? []),
    commerceKitRecipes: commerceKitRecipes.validateCommerceKitRecipes(input.commerceKitRecipes ?? []),
    batchExpiryReminders: batchExpiry.validateBatchExpiryReminders(input.batchExpiryReminders ?? []),
    grnBatchAttributions: grnBatches.validateGrnBatchAttributions(input.grnBatchAttributions ?? []),
    localLotCounts: lotCounts.validateLocalLotCounts(input.localLotCounts ?? []),
    serialCustody: serialCustody.validateSerialCustodyRecords(input.serialCustody ?? []),
    serviceWarranty: serviceWarranty.validateServiceWarrantyState(input.serviceWarranty ?? {warranties:[],claims:[]}),
    serviceSiteVisits: siteVisits.validateServiceSiteVisits(input.serviceSiteVisits ?? []),
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
    shiftRules: snap.shiftRules,
    rosterSlots: snap.rosterSlots,
    assignments: snap.assignments,
    incentiveRules: snap.incentiveRules,
    payouts: snap.payouts,
    notifications: snap.notifications,
  });
  holidayCache.hydrateHolidayCache(snap.holidayRules ?? []);
  phase7Store.hydratePhase7({ returns: snap.returns, auditLogs: snap.audit });

  if (snap.branches?.length) {
    phase9Store.hydratePhase9({ branches: snap.branches, activeBranchId: snap.activeBranchId ?? undefined });
  }
  if (snap.phase10) phase10Store.hydratePhase10(snap.phase10);
  if (snap.warehouse) warehouseStore.hydrateWarehouseState(snap.warehouse);
  batchExpiry.hydrateBatchExpiryReminders(snap.batchExpiryReminders ?? []);
  grnBatches.hydrateGrnBatchAttributions(snap.grnBatchAttributions ?? []);
  lotCounts.hydrateLocalLotCounts(snap.localLotCounts ?? []);
  serialCustody.hydrateSerialCustodyRecords(snap.serialCustody ?? []);
  serviceWarranty.hydrateServiceWarrantyState(snap.serviceWarranty ?? {warranties:[],claims:[]});
  siteVisits.hydrateServiceSiteVisits(snap.serviceSiteVisits ?? []);
  if (snap.procurement) procurementStore.hydrateProcurementState(snap.procurement);
  if (snap.accounting) accountingStore.hydrateAccountingState(snap.accounting);
  commerceTierDrafts.hydrateCommerceTierDrafts(snap.commerceTierDrafts ?? []);
  commerceKitRecipes.hydrateCommerceKitRecipes(snap.commerceKitRecipes ?? []);
  if (snap.shopProfile) shopProfile.hydrateShopProfile(snap.shopProfile);
  onboarding.hydrateOnboarding(snap.onboardingCompletedIds ?? []);
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
      holidays: incoming.holidayRules?.length ?? 0,
      expenses: incoming.expenses.length,
      productionWorkflows: incoming.phase10?.productionWorkflows?.length ?? 0,
      materialRolls: incoming.phase10?.materialRolls?.length ?? 0,
      warehouses: incoming.warehouse?.warehouses?.length ?? 0,
      warehouseLocations: incoming.warehouse?.locations?.length ?? 0,
      batchExpiryReminders: incoming.batchExpiryReminders?.length ?? 0,
      grnBatchAttributions: incoming.grnBatchAttributions?.length ?? 0,
      localLotCounts: incoming.localLotCounts?.length ?? 0,
      serialCustody: incoming.serialCustody?.length ?? 0,
      serviceWarranties: incoming.serviceWarranty?.warranties.length ?? 0,
      serviceWarrantyClaims: incoming.serviceWarranty?.claims.length ?? 0,
      serviceSiteVisits: incoming.serviceSiteVisits?.length ?? 0,
      accounts: incoming.accounting?.accounts?.length ?? 0,
      journals: incoming.accounting?.journals?.length ?? 0,
      localCommerceTierDrafts: incoming.commerceTierDrafts?.length ?? 0,
      localCommerceKitRecipes: incoming.commerceKitRecipes?.length ?? 0,
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
