/**
 * Sync v2 S1 read-only preparation. No client financial event is posted here:
 * S2 adds the authenticated server atomic receipt authority. Legacy / partial
 * offline finance stays pending; NEVER treat this projection as authorization.
 */
import type { DomainSnapshot } from "./persistence";
import type { Sale, Product } from "@minarvabiz/types";
import type { exportWarehouseState } from "./warehouse-store";
import type { LocalOutboxEvent } from "./outbox-bridge";
import type {
  FinancialSyncEnvelopeV1, FinancialSyncProofV1, FinancialSyncReceiptV1,
} from "./financial-sync-contract";
import { aggregateSaleLineQuantities } from "./inventory";
import { calculateInvoiceTotals, calculateLineItem } from "@minarvabiz/billing";
import { addMinorUnits, multiplyMinorByQuantity, subtractMinorUnits, toMinorUnits } from "@minarvabiz/utils";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/;
// Existing shared money is two-decimal. Three-/zero-minor-unit currencies
// require their own reviewed country precision path; NEVER round them to cents.
const TWO_DECIMAL = new Set([
  "AED", "AUD", "BDT", "CAD", "CHF", "CNY", "EUR", "GBP", "HKD",
  "INR", "LKR", "MYR", "NPR", "NZD", "PHP", "PKR", "SAR", "SGD",
  "THB", "USD", "ZAR",
]);

const held = (reason: string): {held:string} => ({ held: reason });
const isObj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
const isTime = (v: unknown): v is string =>
  typeof v === "string" && ISO.test(v) && Number.isFinite(Date.parse(v));
const isMinor = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) &&
  Number.isSafeInteger(Math.round(v * 100)) &&
  Math.abs(v * 100 - Math.round(v * 100)) < 0.0000001;
const isQty = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0 &&
  Number.isSafeInteger(Math.round(v * 1000)) &&
  Math.abs(v * 1000 - Math.round(v * 1000)) < 0.0000001;

function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  return "{" + Object.keys(v).sort()
    .filter(k => (v as Record<string, unknown>)[k] !== undefined)
    .map(k => JSON.stringify(k) + ":" + canonical((v as Record<string, unknown>)[k])).join(",") + "}";
}
const equal = (a: unknown, b: unknown): boolean => {
  try { return canonical(a) === canonical(b); } catch { return false; }
};
const rounded = (a:number,b:number,factor:number) =>
  Number.isFinite(a) && Number.isFinite(b) &&
  Math.round(a * factor) === Math.round(b * factor);

/**
 * Prove an offline stock-version chain without rewriting original sale
 * expectedVersions. These are local read-only claims; the authenticated
 * server must still validate each atomic stock version and receipt.
 */
function saleUsesProduct(event: LocalOutboxEvent, productId: string): boolean {
  return event.aggregateType === "sales" && event.eventType === "insert" &&
    ((isObj(event.payload) && Array.isArray(event.payload.items) &&
      event.payload.items.some(i => isObj(i) && i.productId === productId)) ||
      event.financialSyncProof?.stockLines?.some(line => line.productId === productId) === true);
}

function sequentialLocalStockAfterSale(
  snapshot: DomainSnapshot,
  events: LocalOutboxEvent[],
  current: LocalOutboxEvent,
  proof: FinancialSyncProofV1,
  line: FinancialSyncProofV1["stockLines"][number],
): { productVersion:number; warehouseVersion:number; productStock:number; onHand:number } | null {
  let productVersion = line.expectedProductVersion + 1;
  let warehouseVersion = line.expectedWarehouseVersion + 1;
  let productStock = line.resultingProductStock;
  let onHand = line.resultingOnHand;
  const successors = events.filter(e => e.ownerScope === current.ownerScope &&
    e.deviceId === current.deviceId && e.sequence > current.sequence &&
    saleUsesProduct(e, line.productId)
  ).sort((a,b) => a.sequence-b.sequence);

  for (const next of successors) {
    const nextProof = next.financialSyncProof;
    const stockRows = nextProof?.stockLines?.filter(row => row.productId === line.productId);
    const sales = (snapshot.sales ?? []).filter(s => s.id === next.aggregateId);
    if (next.status === "discarded" ||
        !nextProof || nextProof.schemaVersion !== 1 ||
        nextProof.branchId !== proof.branchId ||
        nextProof.warehouseId !== proof.warehouseId ||
        nextProof.locationId !== proof.locationId ||
        nextProof.currencyCode !== proof.currencyCode ||
        stockRows?.length !== 1 || sales.length !== 1 ||
        !equal(sales[0],next.payload) ||
        !Array.isArray(sales[0].items)) return null;
    const row = stockRows[0];
    if (!isId(row.productId) || !isQty(row.quantity) ||
        !Number.isSafeInteger(row.expectedProductVersion) ||
        !Number.isSafeInteger(row.expectedWarehouseVersion) ||
        row.expectedProductVersion !== productVersion ||
        row.expectedWarehouseVersion !== warehouseVersion ||
        nextProof.expectedVersions?.[row.productId] !== productVersion ||
        row.warehouseId !== line.warehouseId || row.locationId !== line.locationId ||
        !rounded(row.priorProductStock,productStock,1000) ||
        !rounded(row.priorOnHand,onHand,1000) ||
        !rounded(row.priorProductStock-row.quantity,row.resultingProductStock,1000) ||
        !rounded(row.priorOnHand-row.quantity,row.resultingOnHand,1000) ||
        row.resultingProductStock < 0 || row.resultingOnHand < 0)
      return null;
    try {
      const quantities = aggregateSaleLineQuantities(sales[0].items);
      if (!rounded(quantities.get(line.productId) ?? -1,row.quantity,1000)) return null;
    } catch { return null; }
    productVersion++;
    warehouseVersion++;
    productStock = row.resultingProductStock;
    onHand = row.resultingOnHand;
  }
  return { productVersion, warehouseVersion, productStock, onHand };
}

function hasUnacknowledgedPriorStockSale(
  events: LocalOutboxEvent[],
  current: LocalOutboxEvent,
  productId: string,
): boolean {
  return events.some(prior => prior.ownerScope === current.ownerScope &&
    prior.deviceId === current.deviceId && prior.sequence < current.sequence &&
    saleUsesProduct(prior,productId) &&
    (prior.status !== "synced" ||
      !prior.financialSyncProof?.paymentEventIds?.every(id =>
        events.filter(payment => payment.id === id &&
          payment.aggregateType === "payments" &&
          payment.eventType === "insert" &&
          payment.ownerScope === current.ownerScope &&
          payment.deviceId === current.deviceId &&
          payment.status === "synced").length === 1)));
}

function scopeOrg(scope: string): string | null {
  if (typeof scope !== "string") return null;
  const parts = scope.split(":");
  return parts.length === 2 && isId(parts[0]) && isId(parts[1]) ? parts[0] : null;
}

function exactEvent(
  items: LocalOutboxEvent[], id: string, owner: string, device: string
): LocalOutboxEvent | null {
  const matching = items.filter(e => e.id === id);
  if (matching.length !== 1) return null;
  const e = matching[0];
  if (e.ownerScope !== owner || e.deviceId !== device ||
      !isId(e.id) || !isId(e.aggregateId) || !isId(e.deviceId) ||
      !Number.isSafeInteger(e.sequence) || e.sequence < 1 ||
      !isTime(e.occurredAt) || !["pending", "failed"].includes(e.status)) return null;
  return e;
}

/**
 * Capture immutable pre-operation stock evidence BEFORE checkout changes
 * product quantities or warehouse reservations. This is only a claim for
 * later server verification. Missing/ambiguous physical locations return
 * null, never a guessed "global stock" fallback.
 */
export function prepareSaleFinancialStockProof(input: {
  sale: Sale;
  products: Product[];
  warehouse: ReturnType<typeof exportWarehouseState>;
  currencyCode: string;
}): Omit<FinancialSyncProofV1,"paymentEventIds" | "journalId"> | null {
  const { sale, products, warehouse } = input;
  if (!sale || !isId(sale.branchId) || !Array.isArray(sale.items) ||
      !sale.items.length || !warehouse || !Array.isArray(warehouse.stock) ||
      !TWO_DECIMAL.has(input.currencyCode)) return null;
  let quantities: Map<string, number>;
  try {
    for (const line of sale.items) {
      if (!isId(line.productId) || !isQty(line.quantity)) return null;
    }
    quantities = aggregateSaleLineQuantities(sale.items);
  } catch {
    return null;
  }
  const lines: FinancialSyncProofV1["stockLines"] = [];
  const expectedVersions:Record<string,number> = {};
  let warehouseId: string | null=null, locationId: string | null=null;
  for (const [productId,quantity] of quantities) {
    if (!isQty(quantity)) return null;
    const entries=products.filter(p=>p.id===productId);
    const positions=warehouse.stock.filter(p=>p.productId===productId &&
      p.onHand>0);
    if (entries.length!==1 || positions.length!==1) return null;
    const product=entries[0], pos=positions[0];
    const candidateWarehouse=warehouse.warehouses.filter(w=>w.id===pos.warehouseId &&
      w.branchId===sale.branchId && w.isActive && !w.deletedAt);
    const candidateLocation=warehouse.locations.filter(l=>l.id===pos.locationId &&
      l.warehouseId===pos.warehouseId && l.isActive && !l.deletedAt);
    if (candidateWarehouse.length!==1 || candidateLocation.length!==1 ||
        !isId(pos.warehouseId) || !isId(pos.locationId) ||
        !Number.isSafeInteger(product.version ?? NaN) || (product.version ?? 0)<1 ||
        !Number.isSafeInteger(pos.version) || pos.version<1 ||
        !Number.isFinite(product.stockQuantity) || product.stockQuantity<quantity ||
        !Number.isFinite(pos.onHand) || pos.onHand-pos.reserved<quantity ||
        !isQty(pos.onHand) || !isQty(product.stockQuantity) ||
        !Number.isFinite(pos.reserved) || pos.reserved<0)
      return null;
    if (warehouseId && (warehouseId!==pos.warehouseId || locationId!==pos.locationId)) return null;
    warehouseId=pos.warehouseId;locationId=pos.locationId;
    expectedVersions[productId]=product.version!;
    lines.push({
      productId,quantity,expectedProductVersion:product.version!,
      priorProductStock:product.stockQuantity,
      resultingProductStock:Math.round((product.stockQuantity-quantity)*1000)/1000,
      expectedWarehouseVersion:pos.version,priorOnHand:pos.onHand,
      resultingOnHand:Math.round((pos.onHand-quantity)*1000)/1000,
      warehouseId:pos.warehouseId,locationId:pos.locationId,
    });
  }
  if (!warehouseId || !locationId) return null;
  return {
    schemaVersion:1,branchId:sale.branchId,warehouseId,locationId,
    currencyCode:input.currencyCode,currencyExponent:2,expectedVersions,
    stockLines:lines,
  };
}

export function buildSaleFinancialEnvelope(
  snapshot: DomainSnapshot, eventId: string, verifiedOwnerScope: string
): FinancialSyncEnvelopeV1 | { held: string } {
  const org = scopeOrg(verifiedOwnerScope);
  if (!org || !isId(eventId) || !snapshot || !Array.isArray(snapshot.outbox))
    return held("missing_verified_owner_or_event");
  const items = snapshot.outbox;
  const primary = items.filter(e => e.id === eventId);
  if (primary.length !== 1 || primary[0].aggregateType !== "sales" ||
      primary[0].eventType !== "insert" || !isId(primary[0].deviceId))
    return held("missing_sale_event");
  const event = exactEvent(items, eventId, verifiedOwnerScope, primary[0].deviceId);
  if (!event) return held("sale_event_identity_conflict");
  // An event ID can be unique while TWO independently queued insert events
  // refer to the same sale. They must never each produce an apparently valid
  // atomic sale.post envelope (and double-apply stock/payment/journal effects).
  // This includes old synced or failed copies retained after a restore.
  if (items.filter(e => e.aggregateType === "sales" &&
      e.aggregateId === event.aggregateId && e.eventType === "insert").length !== 1)
    return held("duplicate_sale_insert_identity");
  // Server-side device receipts depend on a unique per-device sequence.
  // An offline snapshot merge or corruption may re-use an otherwise valid
  // sequence for another event. Fail closed before constructing any envelope.
  const seenDeviceSequences = new Set<number>();
  for (const candidate of items) {
    if (candidate.ownerScope !== verifiedOwnerScope || candidate.deviceId !== event.deviceId)
      continue;
    if (!Number.isSafeInteger(candidate.sequence) || candidate.sequence < 1 ||
        seenDeviceSequences.has(candidate.sequence))
      return held("duplicate_device_event_sequence");
    seenDeviceSequences.add(candidate.sequence);
  }
  const proof = (event as LocalOutboxEvent & {financialSyncProof?: FinancialSyncProofV1}).financialSyncProof;
  if (!proof || proof.schemaVersion !== 1) return held("missing_pre_operation_authority");
  if (!isId(proof.branchId) || !isId(proof.warehouseId) || !isId(proof.locationId))
    return held("ambiguous_branch_warehouse_location");
  if (!TWO_DECIMAL.has(proof.currencyCode) || proof.currencyExponent !== 2)
    return held("unsupported_currency_precision");
  if (!isId(proof.journalId) || !isObj(proof.expectedVersions) ||
      !Array.isArray(proof.stockLines) || !Array.isArray(proof.paymentEventIds))
    return held("incomplete_stock_authority");

  const matches = (snapshot.sales ?? []).filter(s => s.id === event.aggregateId);
  if (matches.length !== 1 || !equal(matches[0],event.payload))
    return held("sale_payload_revision_conflict");
  const sale = matches[0];
  if (sale.branchId !== proof.branchId ||
      (sale.deviceId && sale.deviceId !== event.deviceId) ||
      !isMinor(sale.total) || !isMinor(sale.paidAmount) ||
      !isMinor(sale.balanceAmount) || !isMinor(sale.taxAmount) ||
      !isMinor(sale.subtotal) || !isMinor(sale.discountAmount) ||
      sale.total < 0 || sale.paidAmount < 0 || sale.balanceAmount < 0 ||
      !rounded(sale.total, sale.paidAmount + sale.balanceAmount, 100) ||
      !isTime(sale.saleDate) || !Array.isArray(sale.items) || !sale.items.length)
    return held("sale_amount_or_branch_conflict");

  let amounts: Map<string, number>;
  try {
    const itemIds = new Set<string>();
    for (const item of sale.items) {
      if (!isId(item.id) || itemIds.has(item.id) ||
          !isId(item.productId) || item.saleId !== sale.id ||
          !isQty(item.quantity) || !isMinor(item.unitPrice) ||
          !isMinor(item.costPrice) || !isMinor(item.lineTotal) ||
          item.unitPrice < 0 || item.costPrice < 0 || item.lineTotal < 0 ||
          !Number.isFinite(item.discountPercent) || item.discountPercent < 0 ||
          item.discountPercent > 100 ||
          !Number.isFinite(item.taxRate) || item.taxRate < 0)
        return held("invalid_sale_item_precision");
      itemIds.add(item.id);
      // Do not trust a self-consistent sale/outbox snapshot if the billed
      // line no longer agrees with quantity, discount and tax. Use the SAME
      // integer-minor-unit billing implementation used at POS checkout.
      const line = calculateLineItem(item);
      if (!rounded(line.total, item.lineTotal, 100))
        return held("sale_line_economics_conflict");
    }
    const totals = calculateInvoiceTotals({ items: sale.items });
    if (!rounded(totals.itemsSubtotal, sale.subtotal, 100) ||
        !rounded(totals.itemsDiscount, sale.discountAmount, 100) ||
        !rounded(totals.itemsTax, sale.taxAmount, 100) ||
        !rounded(totals.grandTotal, sale.total, 100))
      return held("sale_invoice_totals_conflict");
    amounts = aggregateSaleLineQuantities(sale.items);
  } catch {
    // Bad numeric input, unsafe money conversion or malformed quantities
    // cannot produce an authoritative financial reconciliation envelope.
    return held("invalid_sale_item_precision");
  }

  const proofIds = proof.paymentEventIds;
  if (new Set(proofIds).size !== proofIds.length) return held("payment_event_identity_conflict");
  const sourcePayments = (snapshot.payments ?? []).filter(p =>
    p.referenceType === "sale" && p.referenceId === sale.id
  );
  if (proofIds.length !== sourcePayments.length) return held("payment_dependency_missing");
  const sortedPayments: Array<Record<string,unknown>> = [];
  const seenPaymentAggregates = new Set<string>();
  let paymentsTotal = 0;
  for (const id of proofIds) {
    const paymentEvent = exactEvent(items,id,verifiedOwnerScope,event.deviceId);
    if (!paymentEvent || paymentEvent.aggregateType !== "payments" || paymentEvent.eventType !== "insert")
      return held("payment_dependency_missing");
    // A second event ID for the same payment may otherwise represent a
    // second receipt against one transaction. Do not double-count or post it,
    // even if the other copy is already marked synced.
    if (seenPaymentAggregates.has(paymentEvent.aggregateId) ||
        items.filter(e => e.aggregateType === "payments" &&
          e.aggregateId === paymentEvent.aggregateId && e.eventType === "insert").length !== 1)
      return held("duplicate_payment_insert_identity");
    seenPaymentAggregates.add(paymentEvent.aggregateId);
    const matches = sourcePayments.filter(p=>p.id===paymentEvent.aggregateId);
    if (matches.length !== 1 || !equal(matches[0],paymentEvent.payload))
      return held("payment_revision_conflict");
    const payment = matches[0];
    if (!isMinor(payment.amount) || payment.amount <= 0 ||
        !["cash","card","bank","upi","online","other"].includes(payment.method) ||
        payment.branchId && payment.branchId !== proof.branchId ||
        payment.deviceId && payment.deviceId !== event.deviceId)
      return held("invalid_payment_allocation");
    paymentsTotal+=payment.amount;
    sortedPayments.push(payment as unknown as Record<string,unknown>);
  }
  if (!rounded(paymentsTotal,sale.paidAmount,100))
    return held("payment_settlement_conflict");

  const matchingJournals = (snapshot.accounting?.journals ?? []).filter(j =>
    j.id === proof.journalId && j.referenceType === "auto_sale" &&
    j.referenceId === sale.id
  );
  if (matchingJournals.length !== 1 || matchingJournals[0].status !== "posted")
    return held("posted_journal_missing");
  const journal = matchingJournals[0];
  if (journal.branchId !== proof.branchId ||
      !isMinor(journal.totalDebit) || !isMinor(journal.totalCredit) ||
      !Array.isArray(journal.lines) || journal.lines.length < 2 ||
      journal.totalDebit <= 0 || !rounded(journal.totalDebit,journal.totalCredit,100))
    return held("journal_balance_conflict");
  let debit=0, credit=0;
  const usedAccounts=new Map<string,Record<string,unknown>>();
  const ids=new Set<string>();
  for (const line of journal.lines) {
    if (!isId(line.id) || ids.has(line.id) || line.journalEntryId !== journal.id ||
        !isId(line.accountId) || !isMinor(line.debit) || !isMinor(line.credit) ||
        line.debit < 0 || line.credit < 0)
      return held("journal_line_integrity_conflict");
    ids.add(line.id);
    debit+=line.debit;credit+=line.credit;
    const accounts=(snapshot.accounting?.accounts ?? []).filter(a => a.id===line.accountId);
    if (accounts.length!==1 || accounts[0].code!==line.accountCode ||
        accounts[0].name!==line.accountName || accounts[0].deletedAt)
      return held("journal_account_missing");
    usedAccounts.set(line.accountId,accounts[0] as unknown as Record<string,unknown>);
  }
  if (!rounded(debit,journal.totalDebit,100) || !rounded(credit,journal.totalCredit,100))
    return held("journal_balance_conflict");

  // Overall journal balance alone is not proof of a reconciled sale. A
  // self-consistent cash/card swap, omitted receivable, misposted tax or
  // inventory cost would otherwise be sent as an apparently valid invoice.
  // Compare the auto_sale ledger against the same minor-unit posting rules
  // used by checkout; do not trust editable account codes as authority.
  try {
    const expected = new Map<string,{debit:number;credit:number}>();
    const add = (key:string, side:"debit" | "credit", amount:number) => {
      if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("Unsafe journal amount");
      if (amount === 0) return;
      const row = expected.get(key) ?? { debit:0, credit:0 };
      row[side] = addMinorUnits(row[side], amount);
      expected.set(key,row);
    };
    for (const payment of sourcePayments) {
      const key = payment.method === "cash" ? "cash" :
        payment.method === "bank" ? "bank" : "payment_clearing";
      add(key,"debit",toMinorUnits(payment.amount));
    }
    add("accounts_receivable","debit",toMinorUnits(sale.balanceAmount));
    add("product_sales","credit",subtractMinorUnits(
      toMinorUnits(sale.total),toMinorUnits(sale.taxAmount)));
    add("tax_payable","credit",toMinorUnits(sale.taxAmount));
    let cost = 0;
    for (const item of sale.items) {
      cost = addMinorUnits(cost,multiplyMinorByQuantity(
        toMinorUnits(item.costPrice),item.quantity));
    }
    add("cogs","debit",cost);
    add("inventory_asset","credit",cost);

    const observed = new Map<string,{debit:number;credit:number}>();
    for (const line of journal.lines) {
      const account = usedAccounts.get(line.accountId);
      const key = account?.systemKey;
      if (typeof key !== "string" || !expected.has(key) || observed.has(key))
        return held("sale_journal_economics_conflict");
      observed.set(key,{
        debit:toMinorUnits(line.debit),credit:toMinorUnits(line.credit),
      });
    }
    if (observed.size !== expected.size ||
        [...expected].some(([key,amount]) => {
          const actual = observed.get(key);
          return !actual || actual.debit !== amount.debit ||
            actual.credit !== amount.credit;
        })) return held("sale_journal_economics_conflict");
  } catch {
    return held("sale_journal_economics_conflict");
  }

  const versions: Record<string,number>={};
  if (proof.stockLines.length !== amounts.size) return held("stock_dependency_conflict");
  const seenStock=new Set<string>();
  for (const line of proof.stockLines) {
    if (!isId(line.productId) || seenStock.has(line.productId) ||
        !isQty(line.quantity) || !rounded(line.quantity,amounts.get(line.productId) ?? -1,1000) ||
        line.warehouseId!==proof.warehouseId || line.locationId!==proof.locationId ||
        !Number.isSafeInteger(line.expectedProductVersion) || line.expectedProductVersion < 1 ||
        !Number.isSafeInteger(line.expectedWarehouseVersion) || line.expectedWarehouseVersion < 1 ||
        proof.expectedVersions[line.productId] !== line.expectedProductVersion ||
        !isQty(line.priorProductStock) || line.resultingProductStock < 0 ||
        !isQty(line.priorOnHand) || line.resultingOnHand < 0 ||
        !rounded(line.priorProductStock-line.quantity,line.resultingProductStock,1000) ||
        !rounded(line.priorOnHand-line.quantity,line.resultingOnHand,1000))
      return held("stock_pre_operation_authority_conflict");
    seenStock.add(line.productId);
    versions[line.productId]=line.expectedProductVersion;
    if (hasUnacknowledgedPriorStockSale(items,event,line.productId))
      return held("prior_stock_sale_receipt_pending");
    const terminal = sequentialLocalStockAfterSale(snapshot,items,event,proof,line);
    if (!terminal) return held("stock_successor_chain_conflict");
    const product=(snapshot.products ?? []).filter(p=>p.id===line.productId);
    const position=(snapshot.warehouse?.stock ?? []).filter(p=>p.productId===line.productId &&
      p.warehouseId===line.warehouseId && p.locationId===line.locationId);
    const warehouses=(snapshot.warehouse?.warehouses ?? []).filter(w=>w.id===line.warehouseId &&
      w.branchId===proof.branchId && w.isActive && !w.deletedAt);
    const locations=(snapshot.warehouse?.locations ?? []).filter(l=>l.id===line.locationId &&
      l.warehouseId===line.warehouseId && l.isActive && !l.deletedAt);
    if (product.length!==1 || position.length!==1 || warehouses.length!==1 || locations.length!==1 ||
        product[0].version !== terminal.productVersion ||
        position[0].version !== terminal.warehouseVersion ||
        !rounded(product[0].stockQuantity,terminal.productStock,1000) ||
        !rounded(position[0].onHand,terminal.onHand,1000))
      return held("stock_snapshot_revision_conflict");
  }
  if (Object.keys(proof.expectedVersions).length!==seenStock.size)
    return held("stock_version_graph_conflict");
  const result: FinancialSyncEnvelopeV1 = {
    schemaVersion:1, operation:"sale.post", eventId:event.id, organizationId:org,
    deviceId:event.deviceId, branchId:proof.branchId, warehouseId:proof.warehouseId,
    locationId:proof.locationId, sequence:event.sequence, occurredAt:event.occurredAt,
    currencyCode:proof.currencyCode, currencyExponent:2,
    expectedVersions:versions, stockLines:proof.stockLines,
    paymentEventIds:proofIds, journalId:proof.journalId,
    sale:sale as unknown as Record<string,unknown>,
    payments:sortedPayments, accounts:[...usedAccounts.values()],
    journal:journal as unknown as Record<string,unknown>,
  };
  // Only a detached, serializable plain-data copy is returned; this does NOT
  // authenticate client-supplied stock/branch claims. S2 checks all on server.
  try {
    const json=JSON.stringify(result);
    if (json.length>512_000) return held("event_exceeds_size_limit");
    return JSON.parse(json) as FinancialSyncEnvelopeV1;
  } catch {
    return held("non_serializable_financial_event");
  }
}

/**
 * Structural parser only: a digest-shaped field is NOT a cryptographic
 * signature and this function never ACKs local outbox records. S2/S3 must
 * correlate the server-computed canonical request digest under auth/session.
 */
export function validateFinancialReceipt(
  reply: unknown, expected: FinancialSyncEnvelopeV1, verifiedOwnerScope: string
): FinancialSyncReceiptV1 {
  const org = scopeOrg(verifiedOwnerScope);
  if (!org || !expected || expected.schemaVersion !== 1 ||
      expected.operation !== "sale.post" || expected.organizationId !== org)
    throw new Error("Financial receipt organization or session scope mismatch");
  if (!isObj(reply) || reply.accepted !== true || typeof reply.replayed !== "boolean" ||
      reply.eventId !== expected.eventId || !isId(reply.eventId) ||
      reply.organizationId !== org)
    throw new Error("Financial receipt event identity or organization mismatch");
  if (typeof reply.serverCursor !== "string" ||
      !/^[1-9][0-9]*$/.test(reply.serverCursor) ||
      reply.serverCursor.length > 20 || BigInt(reply.serverCursor) > 9223372036854775807n)
    throw new Error("Financial receipt server cursor is invalid");
  if (typeof reply.requestDigest !== "string" || !/^[0-9a-f]{64}$/.test(reply.requestDigest))
    throw new Error("Financial receipt request digest is missing or malformed");
  if (!isTime(reply.committedAt))
    throw new Error("Financial receipt committed timestamp is invalid");
  return {
    accepted:true, replayed:reply.replayed, eventId:reply.eventId as string,
    organizationId:org, serverCursor:reply.serverCursor,
    requestDigest:reply.requestDigest, committedAt:reply.committedAt,
  };
}
