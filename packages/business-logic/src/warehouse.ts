/**
 * Commercial warehouse/WMS foundation.
 * Product.stockQuantity remains the accounting stock total; bin stock allocates
 * that total to physical locations. Bin-to-bin transfers never change the
 * product total and complete only after approval.
 */
import type {
  UUID, Warehouse, WarehouseBin, WarehouseBinStock, WarehouseTransfer,
  WarehouseTransferStatus,
} from "@minarvabiz/types";
import { generateId, nowISO } from "@minarvabiz/utils";
import { assertPermission } from "./permissions";
import { touchPersistence } from "./autosave";
import { enqueueOutbox } from "./outbox-bridge";
import { auditAction } from "./audit-actions";
import { getRemoteWriter, type RemoteWriter } from "./remote-write";
import * as store from "./store";

const warehouses: Warehouse[] = [];
const bins: WarehouseBin[] = [];
const binStocks: WarehouseBinStock[] = [];
const transfers: WarehouseTransfer[] = [];
let transferSequence = 0;

function remoteWrite(run: (writer: RemoteWriter) => Promise<void> | undefined) {
  const writer = getRemoteWriter();
  if (!writer) return;
  try {
    const pending = run(writer);
    if (pending) void pending.catch((e) => console.warn("[minarvabiz] WMS remote write failed", e));
  } catch (e) {
    console.warn("[minarvabiz] WMS remote write failed", e);
  }
}

function roundQty(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

function nextTransferNumber(): string {
  transferSequence += 1;
  const d = new Date();
  const key = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
  return `WTR-${key}-${String(transferSequence).padStart(4,"0")}`;
}

export function listWarehouses(activeOnly = true): Warehouse[] {
  const rows = activeOnly ? warehouses.filter((w) => w.isActive) : [...warehouses];
  return rows.sort((a,b) => a.name.localeCompare(b.name));
}

export function getWarehouse(id: UUID): Warehouse | undefined {
  return warehouses.find((w) => w.id === id && w.isActive);
}

export function createWarehouse(input: { name: string; code: string; branchId?: UUID | null; address?: string | null }): Warehouse {
  assertPermission("inventory.adjust");
  const name = input.name.trim();
  const code = input.code.trim().toUpperCase();
  if (!name) throw new Error("Warehouse name is required");
  if (!code) throw new Error("Warehouse code is required");
  if (warehouses.some((w) => w.isActive && w.code.toLowerCase() === code.toLowerCase())) throw new Error("Warehouse code already exists");
  const now = nowISO();
  const row: Warehouse = {
    id: generateId(), name, code, branchId: input.branchId ?? null, address: input.address?.trim() || null,
    isActive: true, createdAt: now, updatedAt: now, version: 1,
  };
  warehouses.push(row);
  enqueueOutbox("warehouses", row.id, "insert", row as unknown as Record<string, unknown>);
  remoteWrite((w) => w.upsertWarehouse?.(row));
  auditAction("warehouse.create", "warehouses", row.id, null, row);
  touchPersistence();
  return row;
}

export function listWarehouseBins(warehouseId?: UUID): WarehouseBin[] {
  return bins.filter((b) => b.isActive && (!warehouseId || b.warehouseId === warehouseId))
    .sort((a,b) => a.code.localeCompare(b.code));
}

export function getWarehouseBin(id: UUID): WarehouseBin | undefined {
  return bins.find((b) => b.id === id && b.isActive);
}

export function createWarehouseBin(input: {
  warehouseId: UUID; code: string; name?: string | null; zone?: string | null;
  aisle?: string | null; rack?: string | null; shelf?: string | null;
}): WarehouseBin {
  assertPermission("inventory.adjust");
  if (!getWarehouse(input.warehouseId)) throw new Error("Warehouse not found");
  const code = input.code.trim().toUpperCase();
  if (!code) throw new Error("Bin code is required");
  if (bins.some((b) => b.isActive && b.warehouseId === input.warehouseId && b.code.toLowerCase() === code.toLowerCase())) {
    throw new Error("Bin code already exists in this warehouse");
  }
  const now = nowISO();
  const row: WarehouseBin = {
    id: generateId(), warehouseId: input.warehouseId, code,
    name: input.name?.trim() || null, zone: input.zone?.trim() || null,
    aisle: input.aisle?.trim() || null, rack: input.rack?.trim() || null, shelf: input.shelf?.trim() || null,
    isActive: true, createdAt: now, updatedAt: now, version: 1,
  };
  bins.push(row);
  enqueueOutbox("warehouse_bins", row.id, "insert", row as unknown as Record<string, unknown>);
  remoteWrite((w) => w.upsertWarehouseBin?.(row));
  auditAction("warehouse_bin.create", "warehouse_bins", row.id, null, row);
  touchPersistence();
  return row;
}

export function listBinStocks(opts?: { warehouseId?: UUID; binId?: UUID; productId?: UUID }): WarehouseBinStock[] {
  return binStocks.filter((s) =>
    (!opts?.warehouseId || s.warehouseId === opts.warehouseId) &&
    (!opts?.binId || s.binId === opts.binId) &&
    (!opts?.productId || s.productId === opts.productId)
  );
}

export function allocatedQuantity(productId: UUID): number {
  return roundQty(listBinStocks({ productId }).reduce((sum, s) => sum + s.quantity, 0));
}

export function unallocatedQuantity(productId: UUID): number {
  const product = store.getProduct(productId);
  if (!product) return 0;
  return roundQty(Math.max(0, product.stockQuantity - allocatedQuantity(productId)));
}

export function allocateStockToBin(input: { productId: UUID; binId: UUID; quantity: number }): WarehouseBinStock {
  assertPermission("inventory.adjust");
  const product = store.getProduct(input.productId);
  if (!product) throw new Error("Product not found");
  const bin = getWarehouseBin(input.binId);
  if (!bin) throw new Error("Warehouse bin not found");
  const quantity = roundQty(Number(input.quantity));
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Allocation quantity must be greater than zero");
  const available = unallocatedQuantity(product.id);
  if (quantity > available) throw new Error(`Only ${available} unallocated stock is available`);
  const now = nowISO();
  let row = binStocks.find((s) => s.productId === product.id && s.binId === bin.id);
  const before = row ? { ...row } : null;
  if (row) {
    row.quantity = roundQty(row.quantity + quantity);
    row.updatedAt = now;
    row.version += 1;
  } else {
    row = {
      id: generateId(), warehouseId: bin.warehouseId, binId: bin.id, productId: product.id,
      quantity, reservedQuantity: 0, updatedAt: now, version: 1,
    };
    binStocks.push(row);
  }
  enqueueOutbox("warehouse_bin_stock", row.id, before ? "update" : "insert", row as unknown as Record<string, unknown>);
  remoteWrite((w) => w.upsertWarehouseBinStock?.(row));
  auditAction("warehouse.allocate", "warehouse_bin_stock", row.id, before, row);
  touchPersistence();
  return row;
}

export function listWarehouseTransfers(status?: WarehouseTransferStatus): WarehouseTransfer[] {
  return transfers.filter((t) => !status || t.status === status).sort((a,b) => b.requestedAt.localeCompare(a.requestedAt));
}

export function requestWarehouseTransfer(input: {
  productId: UUID; sourceBinId: UUID; destinationBinId: UUID; quantity: number;
  notes?: string | null; requestedBy?: UUID | null;
}): WarehouseTransfer {
  assertPermission("inventory.adjust");
  const product = store.getProduct(input.productId);
  if (!product) throw new Error("Product not found");
  const source = getWarehouseBin(input.sourceBinId);
  const destination = getWarehouseBin(input.destinationBinId);
  if (!source || !destination) throw new Error("Source and destination bins are required");
  if (source.id === destination.id) throw new Error("Source and destination bins must be different");
  const quantity = roundQty(Number(input.quantity));
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Transfer quantity must be greater than zero");
  const sourceStock = binStocks.find((s) => s.productId === product.id && s.binId === source.id);
  const available = roundQty((sourceStock?.quantity ?? 0) - (sourceStock?.reservedQuantity ?? 0));
  if (quantity > available) throw new Error(`Only ${available} available in source bin`);
  sourceStock!.reservedQuantity = roundQty(sourceStock!.reservedQuantity + quantity);
  sourceStock!.updatedAt = nowISO();
  sourceStock!.version += 1;
  const now = nowISO();
  const row: WarehouseTransfer = {
    id: generateId(), transferNumber: nextTransferNumber(), productId: product.id,
    sourceWarehouseId: source.warehouseId, sourceBinId: source.id,
    destinationWarehouseId: destination.warehouseId, destinationBinId: destination.id,
    quantity, status: "pending", notes: input.notes?.trim() || null,
    requestedAt: now, requestedBy: input.requestedBy ?? null, updatedAt: now, version: 1,
  };
  transfers.push(row);
  enqueueOutbox("warehouse_bin_stock", sourceStock!.id, "update", sourceStock! as unknown as Record<string, unknown>);
  enqueueOutbox("warehouse_transfers", row.id, "insert", row as unknown as Record<string, unknown>);
  remoteWrite((w) => w.upsertWarehouseBinStock?.(sourceStock!));
  remoteWrite((w) => w.upsertWarehouseTransfer?.(row));
  auditAction("warehouse_transfer.request", "warehouse_transfers", row.id, null, row);
  touchPersistence();
  return row;
}

function transitionTransfer(id: UUID, from: WarehouseTransferStatus[], to: WarehouseTransferStatus): WarehouseTransfer {
  const row = transfers.find((t) => t.id === id);
  if (!row) throw new Error("Transfer not found");
  if (!from.includes(row.status)) throw new Error(`Cannot change transfer from ${row.status} to ${to}`);
  row.status = to;
  row.updatedAt = nowISO();
  row.version += 1;
  enqueueOutbox("warehouse_transfers", row.id, "update", row as unknown as Record<string, unknown>);
  remoteWrite((w) => w.upsertWarehouseTransfer?.(row));
  touchPersistence();
  return row;
}

export function approveWarehouseTransfer(id: UUID, approvedBy?: UUID | null): WarehouseTransfer {
  assertPermission("inventory.adjust");
  const row = transitionTransfer(id, ["pending"], "approved");
  row.approvedAt = nowISO();
  row.approvedBy = approvedBy ?? null;
  remoteWrite((w) => w.upsertWarehouseTransfer?.(row));
  auditAction("warehouse_transfer.approve", "warehouse_transfers", row.id, { status: "pending" }, { status: "approved" });
  return row;
}

export function dispatchWarehouseTransfer(id: UUID): WarehouseTransfer {
  assertPermission("inventory.adjust");
  const row = transitionTransfer(id, ["approved"], "in_transit");
  row.dispatchedAt = nowISO();
  remoteWrite((w) => w.upsertWarehouseTransfer?.(row));
  auditAction("warehouse_transfer.dispatch", "warehouse_transfers", row.id, { status: "approved" }, { status: "in_transit" });
  return row;
}

export function completeWarehouseTransfer(id: UUID): WarehouseTransfer {
  assertPermission("inventory.adjust");
  const row = transfers.find((t) => t.id === id);
  if (!row) throw new Error("Transfer not found");
  if (!["approved","in_transit"].includes(row.status)) throw new Error("Transfer must be approved before completion");
  const source = binStocks.find((s) => s.productId === row.productId && s.binId === row.sourceBinId);
  if (!source || source.quantity < row.quantity || source.reservedQuantity < row.quantity) throw new Error("Reserved source stock is no longer available");
  let destination = binStocks.find((s) => s.productId === row.productId && s.binId === row.destinationBinId);
  const now = nowISO();
  source.quantity = roundQty(source.quantity - row.quantity);
  source.reservedQuantity = roundQty(Math.max(0, source.reservedQuantity - row.quantity));
  source.updatedAt = now; source.version += 1;
  if (destination) {
    destination.quantity = roundQty(destination.quantity + row.quantity);
    destination.updatedAt = now; destination.version += 1;
  } else {
    destination = {
      id: generateId(), warehouseId: row.destinationWarehouseId, binId: row.destinationBinId,
      productId: row.productId, quantity: row.quantity, reservedQuantity: 0, updatedAt: now, version: 1,
    };
    binStocks.push(destination);
  }
  row.status = "completed"; row.completedAt = now; row.updatedAt = now; row.version += 1;
  enqueueOutbox("warehouse_bin_stock", source.id, "update", source as unknown as Record<string, unknown>);
  enqueueOutbox("warehouse_bin_stock", destination.id, destination.version === 1 ? "insert" : "update", destination as unknown as Record<string, unknown>);
  enqueueOutbox("warehouse_transfers", row.id, "update", row as unknown as Record<string, unknown>);
  remoteWrite((w) => w.upsertWarehouseBinStock?.(source));
  remoteWrite((w) => w.upsertWarehouseBinStock?.(destination));
  remoteWrite((w) => w.upsertWarehouseTransfer?.(row));
  auditAction("warehouse_transfer.complete", "warehouse_transfers", row.id, null, row);
  touchPersistence();
  return row;
}

export function cancelWarehouseTransfer(id: UUID): WarehouseTransfer {
  assertPermission("inventory.adjust");
  const row = transfers.find((t) => t.id === id);
  if (!row) throw new Error("Transfer not found");
  if (["completed","cancelled"].includes(row.status)) throw new Error("Transfer cannot be cancelled");
  const source = binStocks.find((s) => s.productId === row.productId && s.binId === row.sourceBinId);
  if (source) {
    source.reservedQuantity = roundQty(Math.max(0, source.reservedQuantity - row.quantity));
    source.updatedAt = nowISO(); source.version += 1;
    enqueueOutbox("warehouse_bin_stock", source.id, "update", source as unknown as Record<string, unknown>);
    remoteWrite((w) => w.upsertWarehouseBinStock?.(source));
  }
  const before = row.status;
  row.status = "cancelled"; row.updatedAt = nowISO(); row.version += 1;
  enqueueOutbox("warehouse_transfers", row.id, "update", row as unknown as Record<string, unknown>);
  remoteWrite((w) => w.upsertWarehouseTransfer?.(row));
  auditAction("warehouse_transfer.cancel", "warehouse_transfers", row.id, { status: before }, { status: "cancelled" });
  touchPersistence();
  return row;
}

export function warehouseSummary() {
  return {
    warehouses: listWarehouses().length,
    bins: listWarehouseBins().length,
    allocatedUnits: roundQty(binStocks.reduce((s,x)=>s+x.quantity,0)),
    reservedUnits: roundQty(binStocks.reduce((s,x)=>s+x.reservedQuantity,0)),
    pendingTransfers: transfers.filter((t)=>["pending","approved","in_transit"].includes(t.status)).length,
  };
}

export function exportWarehouseState() {
  return { warehouses: [...warehouses], bins: [...bins], binStocks: [...binStocks], transfers: [...transfers], transferSequence };
}

export function hydrateWarehouseState(input?: Partial<ReturnType<typeof exportWarehouseState>>) {
  if (!input) return;
  if (input.warehouses) { warehouses.length=0; warehouses.push(...input.warehouses); }
  if (input.bins) { bins.length=0; bins.push(...input.bins); }
  if (input.binStocks) { binStocks.length=0; binStocks.push(...input.binStocks); }
  if (input.transfers) { transfers.length=0; transfers.push(...input.transfers); }
  if (typeof input.transferSequence === "number") transferSequence=input.transferSequence;
}
