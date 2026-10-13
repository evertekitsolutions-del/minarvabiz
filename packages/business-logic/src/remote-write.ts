/**
 * Optional dual-write to Supabase UnitOfWork after local domain mutations.
 * Set via registerRemoteWriter from the web app when online.
 */

import type {
  StaffAttendanceRecord,
  Customer,
  Category,
  Product,
  Sale,
  ServiceOrder,
  Payment,
  Expense,
  Supplier,
  LaundryOrder,
  Purchase,
  Warehouse,
  WarehouseLocation,
  WarehouseStockPosition,
  WarehouseTransfer,
  PurchaseOrder,
  GoodsReceipt,
  PurchaseInvoice,
  AccountingAccount,
  JournalEntry,
} from "@minarvabiz/types";
import type { LocalOutboxEvent } from "./outbox-bridge";
import type { ShiftRule, RosterSlot } from "./workforce-roster";
import { enqueueOutbox, exportOutbox, getOutboxScope, markOutboxFailed, markOutboxSynced } from "./outbox-bridge";

export interface RemoteWriter {
  getAttendance?: (id: string, staffId?: string, date?: string) => Promise<StaffAttendanceRecord | null>;
  upsertAttendance?: (record: StaffAttendanceRecord, event?: LocalOutboxEvent) => Promise<void>;
  /** Authenticated atomic PostgreSQL HR event authority; never direct table DML. */
  upsertRosterEvent?: (event: LocalOutboxEvent) => Promise<void>;
  /** Read-only tenant/RLS-scoped records used for human conflict comparison. */
  getRosterShift?: (id: string) => Promise<ShiftRule | null>;
  getRosterSlot?: (id: string) => Promise<RosterSlot | null>;
  /** RLS-scoped bounded staff/day snapshot for conflict explanation, never replay authority. */
  getRosterDayPeers?: (staffId: string, workDate: string) => Promise<RosterSlot[]>;
  upsertCustomer?: (c: Customer) => Promise<void>;
  upsertCategory?: (c: Category) => Promise<void>;
  upsertProduct?: (p: Product) => Promise<void>;
  createSale?: (s: Sale, payments: Payment[], allowNegativeStock: boolean) => Promise<void>;
  recordCustomerPayment?: (payment: Payment, settledSales: Sale[]) => Promise<void>;
  adjustStock?: (product: Product, movementType: "stock_in" | "stock_out" | "adjustment", quantity: number, notes?: string | null) => Promise<void>;
  updateSaleSettlement?: (sale: Sale) => Promise<void>;
  createOrder?: (o: ServiceOrder) => Promise<void>;
  updateOrder?: (id: string, patch: Partial<ServiceOrder>) => Promise<void>;
  createPayment?: (p: Payment) => Promise<void>;
  createExpense?: (e: Expense) => Promise<void>;
  createSupplier?: (s: Supplier) => Promise<void>;
  upsertSupplier?: (s: Supplier) => Promise<void>;
  createLaundry?: (o: LaundryOrder) => Promise<void>;
  createPurchase?: (p: Purchase) => Promise<void>;
  updatePurchaseSettlement?: (p: Purchase) => Promise<void>;
  upsertWarehouse?: (w: Warehouse) => Promise<void>;
  upsertWarehouseLocation?: (l: WarehouseLocation) => Promise<void>;
  upsertWarehouseStock?: (s: WarehouseStockPosition) => Promise<void>;
  upsertWarehouseTransfer?: (t: WarehouseTransfer) => Promise<void>;
  upsertPurchaseOrder?: (po: PurchaseOrder) => Promise<void>;
  upsertGoodsReceipt?: (receipt: GoodsReceipt) => Promise<void>;
  upsertPurchaseInvoice?: (invoice: PurchaseInvoice) => Promise<void>;
  upsertAccountingAccount?: (account: AccountingAccount) => Promise<void>;
  upsertJournalEntry?: (entry: JournalEntry) => Promise<void>;
}

let writer: RemoteWriter | null = null;
let verifiedWriterScope: string | null = null;
/** Revocation generation advances for every session-bound writer replacement. */
let writerGeneration = 0;

export function registerRemoteWriter(w: RemoteWriter | null, verifiedScope: string | null = null) {
  writer = w;
  verifiedWriterScope = w && typeof verifiedScope === "string" && /^[^\s:]+:[^\s:]+$/.test(verifiedScope)
    ? verifiedScope
    : null;
  writerGeneration += 1;
}

/** A sender must reject stale confirmations after logout or tenant switch. */
export function getRemoteWriterGeneration(): number {
  return writerGeneration;
}

export function getRemoteWriter(): RemoteWriter | null {
  return writer;
}

/** Only send local events through a writer still authorized for that owner. */
function activeScopedWriter(): RemoteWriter | null {
  const scope = getOutboxScope();
  return writer && scope && verifiedWriterScope === scope ? writer : null;
}

/** Guard queued multi-step operations against a logout/tenant switch mid-flight. */
function isCurrentScopedWriter(
  target: RemoteWriter | null, scope: string | null, generation: number
): target is RemoteWriter {
  return Boolean(target && scope && writer === target &&
    writerGeneration === generation && verifiedWriterScope === scope && getOutboxScope() === scope);
}

export interface ScopedMasterReplayStatus {
  available: boolean;
  pending: number;
  ready: number;
  blocked: number;
}

export interface ScopedMasterReplayResult {
  attempted: number;
  acknowledged: number;
  failed: number;
  remaining: number;
}

/**
 * Only independently replayable metadata is eligible. A pending sale,
 * warehouse change, payment or other transactional event freezes customer
 * balances and stock payloads until their atomic domain RPC is reconciled.
 * Older unscoped events are deliberately not silently claimed.
 */
function eligibleScopedMasterEvents() {
  const safeOwner = verifiedWriterScope && writer && getOutboxScope() === verifiedWriterScope
    ? verifiedWriterScope
    : null;
  // Neither replay decisions nor pending counters may expose another user's
  // unverified, legacy, or previous-organization business events.
  const active = safeOwner ? exportOutbox().filter((event) =>
    event.ownerScope === safeOwner &&
    (event.status === "pending" || event.status === "failed")
  ) : [];
  const transactionsOutstanding = active.some((event) =>
    !["categories", "customers", "products"].includes(event.aggregateType)
  );
  const candidates = safeOwner ? active.filter((event) =>
    event.ownerScope === safeOwner &&
    (event.eventType === "insert" || event.eventType === "update") &&
    (event.aggregateType === "categories" ||
      (!transactionsOutstanding && (event.aggregateType === "customers" || event.aggregateType === "products"))) &&
    event.payload !== null && typeof event.payload === "object" &&
    !Array.isArray(event.payload) &&
    (event.payload as { id?: unknown }).id === event.aggregateId &&
    (event.aggregateType === "categories" ? Boolean(writer?.upsertCategory)
      : event.aggregateType === "customers" ? Boolean(writer?.upsertCustomer)
      : Boolean(writer?.upsertProduct))
  ) : [];
  return { active, candidates };
}

export function getScopedMasterReplayStatus(): ScopedMasterReplayStatus {
  const { active, candidates } = eligibleScopedMasterEvents();
  return {
    available: Boolean(writer && verifiedWriterScope && getOutboxScope() === verifiedWriterScope),
    pending: active.length,
    ready: candidates.length,
    blocked: active.length - candidates.length,
  };
}

let scopedMasterReplayInFlight: Promise<ScopedMasterReplayResult> | null = null;

/**
 * Bounded and serialized retry of verified owner-scoped business masters.
 * Uses the existing authorized RemoteWriter (PostgreSQL/RLS), not a memory
 * simulator. It never replays sale/payment/stock journals as blind upserts.
 */
export function retryScopedMasterOutbox(limit = 50): Promise<ScopedMasterReplayResult> {
  if (scopedMasterReplayInFlight) return scopedMasterReplayInFlight;
  const run = async (): Promise<ScopedMasterReplayResult> => {
    const snapshotWriter = writer;
    const snapshotScope = verifiedWriterScope;
    const snapshotGeneration = writerGeneration;
    const { candidates } = eligibleScopedMasterEvents();
    let attempted = 0;
    let acknowledged = 0;
    let failed = 0;

    for (const event of candidates.sort((a, b) => a.sequence - b.sequence).slice(0,
      Number.isSafeInteger(limit) ? Math.min(50, Math.max(0, limit)) : 0)) {
      if (!snapshotWriter || !snapshotScope || writer !== snapshotWriter ||
          verifiedWriterScope !== snapshotScope ||
          writerGeneration !== snapshotGeneration || getOutboxScope() !== snapshotScope) break;
      // A change made after this retry began must not be silently reordered.
      if (!eligibleScopedMasterEvents().candidates.some((current) => current.id === event.id)) continue;
      attempted++;
      try {
        if (event.aggregateType === "categories") {
          await snapshotWriter.upsertCategory!(event.payload as Category);
        } else if (event.aggregateType === "customers") {
          await snapshotWriter.upsertCustomer!(event.payload as Customer);
        } else if (event.aggregateType === "products") {
          await snapshotWriter.upsertProduct!(event.payload as Product);
        }
        if (writer !== snapshotWriter || verifiedWriterScope !== snapshotScope ||
            writerGeneration !== snapshotGeneration || getOutboxScope() !== snapshotScope) break;
        markOutboxSynced([event.id]);
        acknowledged++;
      } catch (error) {
        if (writer !== snapshotWriter || verifiedWriterScope !== snapshotScope ||
            writerGeneration !== snapshotGeneration || getOutboxScope() !== snapshotScope) break;
        markOutboxFailed(event.id, error instanceof Error ? error.message : String(error));
        failed++;
        // Preserve causal ordering and never skip over an uncommitted earlier version.
        break;
      }
    }
    return { attempted, acknowledged, failed, remaining: getScopedMasterReplayStatus().pending };
  };
  const active = run();
  const flight = active.finally(() => { if (scopedMasterReplayInFlight === flight) scopedMasterReplayInFlight = null; });
  scopedMasterReplayInFlight = flight;
  return flight;
}


/**
 * A local event is acknowledged only after the active authenticated writer
 * reports success. Logout/tenant switching invalidates in-flight acks.
 * Offline and unsupported destinations retain the original pending events.
 */
async function deliverWithCloudAcknowledgement(
  eventIds: string[],
  supports: (target: RemoteWriter) => boolean,
  send: (target: RemoteWriter) => Promise<void>,
  failureLabel: string
): Promise<void> {
  const activeWriter = activeScopedWriter();
  const activeGeneration = writerGeneration;
  const activeScope = getOutboxScope();
  const eventsStillPendingForOwner = () => eventIds.every(id =>
    exportOutbox().some(e => e.id === id && e.status === "pending" && e.ownerScope === activeScope)
  );
  if (!isCurrentScopedWriter(activeWriter, activeScope, activeGeneration) ||
      !eventsStillPendingForOwner() || !supports(activeWriter)) return;
  try {
    await send(activeWriter);
    if (isCurrentScopedWriter(activeWriter, activeScope, activeGeneration) &&
        eventsStillPendingForOwner()) {
      markOutboxSynced(eventIds);
    }
  } catch (error) {
    console.warn("[minarvabiz] " + failureLabel, error);
  }
}

export async function remoteUpsertCustomer(c: Customer) {
  const event = enqueueOutbox("customers", c.id, "insert", c);
  await deliverWithCloudAcknowledgement(
    [event.id], (target) => Boolean(target.upsertCustomer),
    (target) => target.upsertCustomer!(c), "remote customer write failed"
  );
}

export async function remoteUpsertCategory(c: Category) {
  const event = enqueueOutbox("categories", c.id, "insert", c);
  await deliverWithCloudAcknowledgement(
    [event.id], (target) => Boolean(target.upsertCategory),
    (target) => target.upsertCategory!(c), "remote category write failed"
  );
}

export async function remoteUpsertProduct(p: Product) {
  const event = enqueueOutbox("products", p.id, "insert", p);
  await deliverWithCloudAcknowledgement(
    [event.id], (target) => Boolean(target.upsertProduct),
    (target) => target.upsertProduct!(p), "remote product write failed"
  );
}

export async function remoteCreateSale(s: Sale, payments: Payment[] = [], allowNegativeStock = false) {
  const eventIds = [enqueueOutbox("sales", s.id, "insert", s).id];
  for (const payment of payments) {
    eventIds.push(enqueueOutbox("payments", payment.id, "insert", payment).id);
  }
  await deliverWithCloudAcknowledgement(
    eventIds, (target) => Boolean(target.createSale),
    (target) => target.createSale!(s, payments, allowNegativeStock),
    "atomic remote sale write failed"
  );
}

export async function remoteAdjustStock(
  product: Product,
  movementType: "stock_in" | "stock_out" | "adjustment",
  quantity: number,
  notes?: string | null
) {
  enqueueOutbox("products", product.id, "update", product);
  try { await activeScopedWriter()?.adjustStock?.(product, movementType, quantity, notes); }
  catch (e) { console.warn("[minarvabiz] atomic remote stock adjustment failed", e); }
}

export async function remoteCreateOrder(o: ServiceOrder) {
  enqueueOutbox("orders", o.id, "insert", o);
  try { await activeScopedWriter()?.createOrder?.(o); }
  catch (e) { console.warn("[minarvabiz] remote order write failed", e); }
}

export async function remoteCreatePayment(p: Payment) {
  enqueueOutbox("payments", p.id, "insert", p);
  try { await activeScopedWriter()?.createPayment?.(p); }
  catch (e) { console.warn("[minarvabiz] remote payment write failed", e); }
}

export async function remoteCreateExpense(e: Expense) {
  enqueueOutbox("expenses", e.id, "insert", e);
  try { await activeScopedWriter()?.createExpense?.(e); }
  catch (err) { console.warn("[minarvabiz] remote expense write failed", err); }
}

export async function remoteCreateSupplier(s: Supplier) {
  enqueueOutbox("suppliers", s.id, "insert", s);
  try {
    const target = activeScopedWriter();
    if (target?.upsertSupplier) await target.upsertSupplier(s);
    else await target?.createSupplier?.(s);
  }
  catch (e) { console.warn("[minarvabiz] remote supplier write failed", e); }
}

export async function remoteUpsertSupplier(s: Supplier) {
  enqueueOutbox("suppliers", s.id, "update", s);
  try {
    const target = activeScopedWriter();
    if (target?.upsertSupplier) await target.upsertSupplier(s);
    else await target?.createSupplier?.(s);
  }
  catch (e) { console.warn("[minarvabiz] remote supplier update failed", e); }
}

export async function remoteCreateLaundry(o: LaundryOrder) {
  enqueueOutbox("laundry_orders", o.id, "insert", o);
  try { await activeScopedWriter()?.createLaundry?.(o); }
  catch (e) { console.warn("[minarvabiz] remote laundry write failed", e); }
}

export async function remoteCreatePurchase(p: Purchase, supplier?: Supplier) {
  const purchase = { ...p }, supplierSnapshot = supplier ? { ...supplier } : undefined;
  enqueueOutbox("purchases", purchase.id, "insert", purchase);
  if (supplierSnapshot) enqueueOutbox("suppliers", supplierSnapshot.id, "update", supplierSnapshot);
  const target = activeScopedWriter();
  const scope = getOutboxScope(), generation = writerGeneration;
  const write = async () => {
    try {
      if (!isCurrentScopedWriter(target, scope, generation)) return;
      await target.createPurchase?.(purchase);
      if (supplierSnapshot && isCurrentScopedWriter(target, scope, generation)) {
        await target.upsertSupplier?.(supplierSnapshot);
      }
    } catch (e) { console.warn("[minarvabiz] remote purchase write failed", e); }
  };
  supplierSettlementQueue = supplierSettlementQueue.then(write, write);
  await supplierSettlementQueue;
}


export async function remoteUpsertWarehouse(w: Warehouse) {
  enqueueOutbox("warehouses", w.id, "update", w);
  try { await activeScopedWriter()?.upsertWarehouse?.(w); }
  catch (e) { console.warn("[minarvabiz] remote warehouse write failed", e); }
}

export async function remoteUpsertWarehouseLocation(l: WarehouseLocation) {
  enqueueOutbox("warehouse_locations", l.id, "update", l);
  try { await activeScopedWriter()?.upsertWarehouseLocation?.(l); }
  catch (e) { console.warn("[minarvabiz] remote warehouse location write failed", e); }
}

export async function remoteUpsertWarehouseStock(s: WarehouseStockPosition) {
  enqueueOutbox("warehouse_stock", s.id, "update", s);
  try { await activeScopedWriter()?.upsertWarehouseStock?.(s); }
  catch (e) { console.warn("[minarvabiz] remote warehouse stock write failed", e); }
}

export async function remoteUpsertWarehouseTransfer(t: WarehouseTransfer) {
  enqueueOutbox("warehouse_transfers", t.id, "update", t);
  try { await activeScopedWriter()?.upsertWarehouseTransfer?.(t); }
  catch (e) { console.warn("[minarvabiz] remote warehouse transfer write failed", e); }
}

export async function remoteUpsertPurchaseOrder(po: PurchaseOrder) {
  enqueueOutbox("purchase_orders", po.id, "update", po);
  for (const line of po.lines) {
    enqueueOutbox("purchase_order_lines", line.id, "update", line);
  }
  try { await activeScopedWriter()?.upsertPurchaseOrder?.(po); }
  catch (e) { console.warn("[minarvabiz] remote purchase-order write failed", e); }
}


export async function remoteUpsertGoodsReceipt(receipt: GoodsReceipt) {
  enqueueOutbox("goods_receipts", receipt.id, "insert", receipt);
  for (const line of receipt.lines) {
    enqueueOutbox("goods_receipt_lines", line.id, "insert", line);
  }
  try { await activeScopedWriter()?.upsertGoodsReceipt?.(receipt); }
  catch (e) { console.warn("[minarvabiz] remote goods-receipt write failed", e); }
}


export async function remoteUpsertPurchaseInvoice(invoice: PurchaseInvoice) {
  enqueueOutbox("purchase_invoices", invoice.id, "update", invoice);
  for (const line of invoice.lines) {
    enqueueOutbox("purchase_invoice_lines", line.id, "update", line);
  }
  try { await activeScopedWriter()?.upsertPurchaseInvoice?.(invoice); }
  catch (e) { console.warn("[minarvabiz] remote purchase-invoice write failed", e); }
}


export async function remoteUpsertAccountingAccount(account: AccountingAccount) {
  enqueueOutbox("accounts", account.id, "update", account);
  try { await activeScopedWriter()?.upsertAccountingAccount?.(account); }
  catch (e) { console.warn("[minarvabiz] remote accounting account write failed", e); }
}

export async function remoteUpsertJournalEntry(entry: JournalEntry) {
  enqueueOutbox("journal_entries", entry.id, "update", entry);
  for (const line of entry.lines) enqueueOutbox("journal_entry_lines", line.id, "update", line);
  try { await activeScopedWriter()?.upsertJournalEntry?.(entry); }
  catch (e) { console.warn("[minarvabiz] remote journal write failed", e); }
}

/** Queue the complete expense posting before awaiting any online I/O. */
export async function remoteCreateExpenseWithJournal(expense: Expense, accounts: AccountingAccount[], entry: JournalEntry) {
  enqueueOutbox("expenses", expense.id, "insert", expense);
  for (const account of accounts) enqueueOutbox("accounts", account.id, "update", account);
  enqueueOutbox("journal_entries", entry.id, "update", entry);
  for (const line of entry.lines) enqueueOutbox("journal_entry_lines", line.id, "update", line);
  const target = activeScopedWriter();
  const scope = getOutboxScope(), generation = writerGeneration;
  try {
    if (!isCurrentScopedWriter(target, scope, generation)) return;
    await target.createExpense?.(expense);
    for (const account of accounts) {
      if (!isCurrentScopedWriter(target, scope, generation)) return;
      await target.upsertAccountingAccount?.(account);
    }
    if (isCurrentScopedWriter(target, scope, generation)) await target.upsertJournalEntry?.(entry);
  } catch (error) {
    console.warn("[minarvabiz] expense accounting write pending in outbox", error);
  }
}

let collectionWriteQueue: Promise<void> = Promise.resolve();

/** Persist collections and invoice settlements without inserting duplicate sales. */
export async function remoteCollectCustomerPayment(payment: Payment, customer: Customer, settledSales: Sale[]) {
  enqueueOutbox("payments", payment.id, "insert", payment);
  enqueueOutbox("customers", customer.id, "update", customer);
  for (const sale of settledSales) enqueueOutbox("sales", sale.id, "update", sale);
  const target = activeScopedWriter();
  const scope = getOutboxScope(), generation = writerGeneration;
  const write = async () => {
    try {
      if (!isCurrentScopedWriter(target, scope, generation)) return;
      if (target.recordCustomerPayment) {
        await target.recordCustomerPayment(payment, settledSales);
      } else {
        await target.createPayment?.(payment);
        for (const sale of settledSales) {
          if (!isCurrentScopedWriter(target, scope, generation)) return;
          await target.updateSaleSettlement?.(sale);
        }
        if (isCurrentScopedWriter(target, scope, generation)) await target.upsertCustomer?.(customer);
      }
    } catch (error) {
      console.warn("[minarvabiz] customer collection pending in outbox", error);
    }
  };
  // Prevent a slow earlier collection from overwriting a later settlement.
  collectionWriteQueue = collectionWriteQueue.then(write, write);
  await collectionWriteQueue;
}

/** Accounts must exist before their journal lines; queue all records before I/O. */
export async function remoteAutomaticPosting(accounts: AccountingAccount[], entry: JournalEntry) {
  for (const account of accounts) enqueueOutbox("accounts", account.id, "update", account);
  enqueueOutbox("journal_entries", entry.id, "update", entry);
  for (const line of entry.lines) enqueueOutbox("journal_entry_lines", line.id, "update", line);
  const target = activeScopedWriter();
  const scope = getOutboxScope(), generation = writerGeneration;
  try {
    for (const account of accounts) {
      if (!isCurrentScopedWriter(target, scope, generation)) return;
      await target.upsertAccountingAccount?.(account);
    }
    if (isCurrentScopedWriter(target, scope, generation)) await target.upsertJournalEntry?.(entry);
  } catch (error) { console.warn("[minarvabiz] automatic accounting pending in outbox", error); }
}

let supplierSettlementQueue: Promise<void> = Promise.resolve();
/** Queue complete settlement snapshots; older online requests cannot overwrite newer balances. */
export async function remoteSupplierSettlement(payment: Payment, supplier: Supplier, invoices: PurchaseInvoice[], purchases: Purchase[]) {
  enqueueOutbox("payments", payment.id, "insert", payment);
  enqueueOutbox("suppliers", supplier.id, "update", supplier);
  for (const invoice of invoices) enqueueOutbox("purchase_invoices", invoice.id, "update", invoice);
  for (const purchase of purchases) enqueueOutbox("purchases", purchase.id, "update", purchase);
  const target = activeScopedWriter();
  const scope = getOutboxScope(), generation = writerGeneration;
  const write = async () => {
    try {
      if (!isCurrentScopedWriter(target, scope, generation)) return;
      await target.createPayment?.(payment);
      for (const invoice of invoices) {
        if (!isCurrentScopedWriter(target, scope, generation)) return;
        await target.upsertPurchaseInvoice?.(invoice);
      }
      for (const purchase of purchases) {
        if (!isCurrentScopedWriter(target, scope, generation)) return;
        await target.updatePurchaseSettlement?.(purchase);
      }
      if (isCurrentScopedWriter(target, scope, generation)) await target.upsertSupplier?.(supplier);
    } catch (error) { console.warn("[minarvabiz] supplier settlement pending in outbox", error); }
  };
  supplierSettlementQueue = supplierSettlementQueue.then(write, write);
  await supplierSettlementQueue;
}
