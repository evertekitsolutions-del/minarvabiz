/**
 * Warehouse / WMS foundation.
 *
 * Location stock is an allocation layer over Product.stockQuantity. Product stock
 * remains the accounting source of truth; this module tracks where allocated
 * units physically sit and keeps those allocations synchronized on sales and
 * warehouse transfers.
 */
import type {
  UUID,
  Warehouse,
  WarehouseLocation,
  WarehouseLocationType,
  WarehouseStockPosition,
  WarehouseTransfer,
  WarehouseTransferStatus,
} from "@minarvabiz/types";
import { generateId, nowISO } from "@minarvabiz/utils";
import { assertPermission } from "./permissions";
import { touchPersistence } from "./autosave";
import { auditAction } from "./audit-actions";
import {
  remoteUpsertWarehouse,
  remoteUpsertWarehouseLocation,
  remoteUpsertWarehouseStock,
  remoteUpsertWarehouseTransfer,
} from "./remote-write";

const warehouses: Warehouse[] = [];
const locations: WarehouseLocation[] = [];
const stock: WarehouseStockPosition[] = [];
const transfers: WarehouseTransfer[] = [];
let transferSequence = 0;

function roundQty(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
}

function activeWarehouse(id: UUID): Warehouse | undefined {
  return warehouses.find((w) => w.id === id && w.isActive && !w.deletedAt);
}

function activeLocation(id: UUID): WarehouseLocation | undefined {
  return locations.find((l) => l.id === id && l.isActive && !l.deletedAt);
}

function positionFor(locationId: UUID, productId: UUID): WarehouseStockPosition | undefined {
  return stock.find((s) => s.locationId === locationId && s.productId === productId);
}

function getOrCreatePosition(locationId: UUID, productId: UUID): WarehouseStockPosition {
  const location = activeLocation(locationId);
  if (!location) throw new Error("Warehouse location not found");
  const existing = positionFor(locationId, productId);
  if (existing) return existing;
  const created: WarehouseStockPosition = {
    id: generateId(),
    warehouseId: location.warehouseId,
    locationId,
    productId,
    onHand: 0,
    reserved: 0,
    updatedAt: nowISO(),
    version: 1,
  };
  stock.push(created);
  return created;
}

function persistStockPosition(position: WarehouseStockPosition) {
  position.onHand = roundQty(Math.max(0, position.onHand));
  position.reserved = roundQty(Math.max(0, Math.min(position.reserved, position.onHand)));
  position.updatedAt = nowISO();
  position.version += 1;
  void remoteUpsertWarehouseStock({ ...position });
}

function nextTransferNumber(): string {
  transferSequence += 1;
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `WTR-${day}-${String(transferSequence).padStart(4, "0")}`;
}

export function listWarehouses(includeInactive = false): Warehouse[] {
  return warehouses
    .filter((w) => !w.deletedAt && (includeInactive || w.isActive))
    .map((w) => ({ ...w }))
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name));
}

export function listWarehouseLocations(warehouseId?: UUID): WarehouseLocation[] {
  return locations
    .filter((l) => !l.deletedAt && l.isActive && (!warehouseId || l.warehouseId === warehouseId))
    .map((l) => ({ ...l }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

export function listWarehouseStock(filters?: {
  warehouseId?: UUID;
  locationId?: UUID;
  productId?: UUID;
}): WarehouseStockPosition[] {
  return stock
    .filter((s) =>
      (!filters?.warehouseId || s.warehouseId === filters.warehouseId) &&
      (!filters?.locationId || s.locationId === filters.locationId) &&
      (!filters?.productId || s.productId === filters.productId)
    )
    .map((s) => ({ ...s }))
    .sort((a, b) => a.productId.localeCompare(b.productId) || a.locationId.localeCompare(b.locationId));
}

export function listWarehouseTransfers(status?: WarehouseTransferStatus): WarehouseTransfer[] {
  return transfers
    .filter((t) => !status || t.status === status)
    .map((t) => ({ ...t }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createWarehouse(input: {
  name: string;
  code: string;
  branchId?: UUID | null;
  isDefault?: boolean;
}): { warehouse: Warehouse | null; errors: string[] } {
  assertPermission("inventory.adjust");
  const name = input.name.trim();
  const code = input.code.trim().toUpperCase();
  const errors: string[] = [];
  if (!name) errors.push("Warehouse name is required");
  if (!code) errors.push("Warehouse code is required");
  if (warehouses.some((w) => !w.deletedAt && w.code.toLowerCase() === code.toLowerCase())) {
    errors.push("Warehouse code already exists");
  }
  if (errors.length) return { warehouse: null, errors };

  if (input.isDefault) {
    for (const warehouse of warehouses) {
      if (warehouse.isDefault && !warehouse.deletedAt) {
        warehouse.isDefault = false;
        warehouse.updatedAt = nowISO();
        warehouse.version += 1;
        void remoteUpsertWarehouse({ ...warehouse });
      }
    }
  }

  const now = nowISO();
  const warehouse: Warehouse = {
    id: generateId(),
    name,
    code,
    branchId: input.branchId ?? null,
    isDefault: Boolean(input.isDefault) || warehouses.filter((w) => !w.deletedAt).length === 0,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
  warehouses.push(warehouse);
  void remoteUpsertWarehouse({ ...warehouse });
  auditAction("warehouse.create", "warehouses", warehouse.id, null, warehouse);
  touchPersistence();
  return { warehouse: { ...warehouse }, errors: [] };
}

export function createWarehouseLocation(input: {
  warehouseId: UUID;
  code: string;
  name: string;
  type?: WarehouseLocationType;
}): { location: WarehouseLocation | null; errors: string[] } {
  assertPermission("inventory.adjust");
  const errors: string[] = [];
  const warehouse = activeWarehouse(input.warehouseId);
  if (!warehouse) errors.push("Warehouse not found");
  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();
  if (!code) errors.push("Location code is required");
  if (!name) errors.push("Location name is required");
  if (locations.some((l) => !l.deletedAt && l.warehouseId === input.warehouseId && l.code.toLowerCase() === code.toLowerCase())) {
    errors.push("Location code already exists in this warehouse");
  }
  if (errors.length || !warehouse) return { location: null, errors };

  const now = nowISO();
  const location: WarehouseLocation = {
    id: generateId(),
    warehouseId: warehouse.id,
    code,
    name,
    type: input.type ?? "storage",
    isActive: true,
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
  locations.push(location);
  void remoteUpsertWarehouseLocation({ ...location });
  auditAction("warehouse.location.create", "warehouse_locations", location.id, null, location);
  touchPersistence();
  return { location: { ...location }, errors: [] };
}

/**
 * Validate a physical-location allocation without mutating WMS state.
 * Procurement uses this before posting a GRN so an invalid allocation cannot
 * leave PO received quantities or Product.stockQuantity partially updated.
 */
export function validateExistingStockAllocation(input: {
  productId: UUID;
  locationId: UUID;
  quantity: number;
  productTotalStock: number;
}): string[] {
  const errors: string[] = [];
  const location = activeLocation(input.locationId);
  const qty = roundQty(input.quantity);
  if (!location) errors.push("Warehouse location not found");
  if (!Number.isFinite(qty) || qty <= 0) errors.push("Quantity must be greater than zero");
  const alreadyAllocated = stock
    .filter((s) => s.productId === input.productId)
    .reduce((sum, s) => sum + s.onHand, 0);
  if (alreadyAllocated + qty > roundQty(Math.max(0, input.productTotalStock))) {
    errors.push(`Allocation exceeds product stock. Unallocated quantity: ${roundQty(Math.max(0, input.productTotalStock - alreadyAllocated))}`);
  }
  return errors;
}

/**
 * Allocate already-existing Product.stockQuantity to a physical location.
 * This does not increase product stock; it only says where existing stock sits.
 */
export function allocateExistingStock(input: {
  productId: UUID;
  locationId: UUID;
  quantity: number;
  productTotalStock: number;
}): { position: WarehouseStockPosition | null; errors: string[] } {
  assertPermission("inventory.adjust");
  const errors = validateExistingStockAllocation(input);
  const location = activeLocation(input.locationId);
  const qty = roundQty(input.quantity);
  if (errors.length || !location) return { position: null, errors };

  const position = getOrCreatePosition(location.id, input.productId);
  const before = { ...position };
  position.onHand = roundQty(position.onHand + qty);
  persistStockPosition(position);
  auditAction("warehouse.stock.allocate", "warehouse_stock", position.id, before, position);
  touchPersistence();
  return { position: { ...position }, errors: [] };
}

export function reserveWarehouseStock(input: {
  productId: UUID;
  locationId: UUID;
  quantity: number;
}): { position: WarehouseStockPosition | null; errors: string[] } {
  assertPermission("inventory.adjust");
  const position = positionFor(input.locationId, input.productId);
  const qty = roundQty(input.quantity);
  const errors: string[] = [];
  if (!position) errors.push("Stock position not found");
  if (qty <= 0) errors.push("Quantity must be greater than zero");
  if (position && position.onHand - position.reserved < qty) errors.push("Not enough available stock");
  if (errors.length || !position) return { position: null, errors };
  const before = { ...position };
  position.reserved = roundQty(position.reserved + qty);
  persistStockPosition(position);
  auditAction("warehouse.stock.reserve", "warehouse_stock", position.id, before, position);
  touchPersistence();
  return { position: { ...position }, errors: [] };
}

export function releaseWarehouseReservation(input: {
  productId: UUID;
  locationId: UUID;
  quantity: number;
}): WarehouseStockPosition | null {
  assertPermission("inventory.adjust");
  const position = positionFor(input.locationId, input.productId);
  if (!position) return null;
  const before = { ...position };
  position.reserved = roundQty(Math.max(0, position.reserved - Math.max(0, input.quantity)));
  persistStockPosition(position);
  auditAction("warehouse.stock.release", "warehouse_stock", position.id, before, position);
  touchPersistence();
  return { ...position };
}

export function createWarehouseTransfer(input: {
  productId: UUID;
  sourceLocationId: UUID;
  destinationLocationId: UUID;
  quantity: number;
  notes?: string | null;
  createdBy?: UUID | null;
}): { transfer: WarehouseTransfer | null; errors: string[] } {
  assertPermission("inventory.adjust");
  const errors: string[] = [];
  const source = activeLocation(input.sourceLocationId);
  const destination = activeLocation(input.destinationLocationId);
  const qty = roundQty(input.quantity);
  if (!source) errors.push("Source location not found");
  if (!destination) errors.push("Destination location not found");
  if (source && destination && source.id === destination.id) errors.push("Source and destination must be different");
  if (!Number.isFinite(qty) || qty <= 0) errors.push("Quantity must be a finite number greater than zero");
  const sourcePosition = source ? positionFor(source.id, input.productId) : undefined;
  if (!sourcePosition || sourcePosition.onHand - sourcePosition.reserved < qty) {
    errors.push("Insufficient available stock at source location");
  }
  if (errors.length || !source || !destination) return { transfer: null, errors };

  const now = nowISO();
  const transfer: WarehouseTransfer = {
    id: generateId(),
    transferNumber: nextTransferNumber(),
    productId: input.productId,
    sourceWarehouseId: source.warehouseId,
    sourceLocationId: source.id,
    destinationWarehouseId: destination.warehouseId,
    destinationLocationId: destination.id,
    quantity: qty,
    status: "draft",
    notes: input.notes ?? null,
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy ?? null,
    version: 1,
  };
  transfers.push(transfer);
  void remoteUpsertWarehouseTransfer({ ...transfer });
  auditAction("warehouse.transfer.create", "warehouse_transfers", transfer.id, null, transfer);
  touchPersistence();
  return { transfer: { ...transfer }, errors: [] };
}

function updateTransfer(transfer: WarehouseTransfer, status: WarehouseTransferStatus) {
  transfer.status = status;
  transfer.updatedAt = nowISO();
  transfer.version += 1;
  void remoteUpsertWarehouseTransfer({ ...transfer });
  touchPersistence();
}

export function approveWarehouseTransfer(id: UUID): { transfer: WarehouseTransfer | null; error?: string } {
  assertPermission("inventory.adjust");
  const transfer = transfers.find((t) => t.id === id);
  if (!transfer) return { transfer: null, error: "Transfer not found" };
  if (transfer.status !== "draft") return { transfer: null, error: "Only draft transfers can be approved" };
  const source = positionFor(transfer.sourceLocationId, transfer.productId);
  if (!source || source.onHand - source.reserved < transfer.quantity) {
    return { transfer: null, error: "Insufficient available stock at source location" };
  }
  const beforePosition = { ...source };
  source.reserved = roundQty(source.reserved + transfer.quantity);
  persistStockPosition(source);
  transfer.approvedAt = nowISO();
  updateTransfer(transfer, "approved");
  auditAction("warehouse.transfer.approve", "warehouse_transfers", transfer.id, null, {
    transfer,
    sourceBefore: beforePosition,
    sourceAfter: source,
  });
  return { transfer: { ...transfer } };
}

export function dispatchWarehouseTransfer(id: UUID): { transfer: WarehouseTransfer | null; error?: string } {
  assertPermission("inventory.adjust");
  const transfer = transfers.find((t) => t.id === id);
  if (!transfer) return { transfer: null, error: "Transfer not found" };
  if (transfer.status !== "approved") return { transfer: null, error: "Transfer must be approved before dispatch" };
  const source = positionFor(transfer.sourceLocationId, transfer.productId);
  if (!source || source.onHand < transfer.quantity || source.reserved < transfer.quantity) {
    return { transfer: null, error: "Reserved source stock is no longer available" };
  }
  const before = { ...source };
  source.onHand = roundQty(source.onHand - transfer.quantity);
  source.reserved = roundQty(source.reserved - transfer.quantity);
  persistStockPosition(source);
  transfer.dispatchedAt = nowISO();
  updateTransfer(transfer, "in_transit");
  auditAction("warehouse.transfer.dispatch", "warehouse_transfers", transfer.id, before, {
    transfer,
    sourceAfter: source,
  });
  return { transfer: { ...transfer } };
}

export function receiveWarehouseTransfer(id: UUID): { transfer: WarehouseTransfer | null; error?: string } {
  assertPermission("inventory.adjust");
  const transfer = transfers.find((t) => t.id === id);
  if (!transfer) return { transfer: null, error: "Transfer not found" };
  if (transfer.status !== "in_transit") return { transfer: null, error: "Only in-transit transfers can be received" };
  const destination = getOrCreatePosition(transfer.destinationLocationId, transfer.productId);
  const before = { ...destination };
  destination.onHand = roundQty(destination.onHand + transfer.quantity);
  persistStockPosition(destination);
  transfer.receivedAt = nowISO();
  updateTransfer(transfer, "received");
  auditAction("warehouse.transfer.receive", "warehouse_transfers", transfer.id, before, {
    transfer,
    destinationAfter: destination,
  });
  return { transfer: { ...transfer } };
}

export function cancelWarehouseTransfer(id: UUID): { transfer: WarehouseTransfer | null; error?: string } {
  assertPermission("inventory.adjust");
  const transfer = transfers.find((t) => t.id === id);
  if (!transfer) return { transfer: null, error: "Transfer not found" };
  if (transfer.status === "received" || transfer.status === "cancelled") {
    return { transfer: null, error: "Completed/cancelled transfer cannot be cancelled" };
  }
  if (transfer.status === "approved") {
    const source = positionFor(transfer.sourceLocationId, transfer.productId);
    if (source) {
      source.reserved = roundQty(Math.max(0, source.reserved - transfer.quantity));
      persistStockPosition(source);
    }
  } else if (transfer.status === "in_transit") {
    const source = getOrCreatePosition(transfer.sourceLocationId, transfer.productId);
    source.onHand = roundQty(source.onHand + transfer.quantity);
    persistStockPosition(source);
  }
  transfer.cancelledAt = nowISO();
  updateTransfer(transfer, "cancelled");
  auditAction("warehouse.transfer.cancel", "warehouse_transfers", transfer.id, null, transfer);
  return { transfer: { ...transfer } };
}

/**
 * Internal stock-consumption hook used by sales/stock-out operations.
 * Only physically allocated stock is reduced; unallocated product stock remains
 * represented by Product.stockQuantity minus the sum of warehouse allocations.
 */
export function consumeWarehouseStock(
  productId: UUID,
  quantity: number,
  branchId?: UUID | null
): { allocatedConsumed: number; unallocatedQuantity: number } {
  let remaining = roundQty(Math.max(0, quantity));
  if (remaining <= 0) return { allocatedConsumed: 0, unallocatedQuantity: 0 };
  const eligible = stock
    .filter((position) => {
      if (position.productId !== productId || position.onHand <= position.reserved) return false;
      if (!branchId) return true;
      const warehouse = warehouses.find((w) => w.id === position.warehouseId);
      return warehouse?.branchId === branchId;
    })
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));

  let consumed = 0;
  for (const position of eligible) {
    if (remaining <= 0) break;
    const available = roundQty(Math.max(0, position.onHand - position.reserved));
    const take = roundQty(Math.min(available, remaining));
    if (take <= 0) continue;
    position.onHand = roundQty(position.onHand - take);
    remaining = roundQty(remaining - take);
    consumed = roundQty(consumed + take);
    persistStockPosition(position);
  }
  if (consumed > 0) touchPersistence();
  return { allocatedConsumed: consumed, unallocatedQuantity: remaining };
}

export function warehouseStockSummary(productTotalById: Record<string, number>) {
  const positions = listWarehouseStock();
  const allocatedByProduct = new Map<string, number>();
  const reservedByProduct = new Map<string, number>();
  const inTransitByProduct = new Map<string, number>();
  for (const position of positions) {
    allocatedByProduct.set(position.productId, (allocatedByProduct.get(position.productId) ?? 0) + position.onHand);
    reservedByProduct.set(position.productId, (reservedByProduct.get(position.productId) ?? 0) + position.reserved);
  }
  for (const transfer of transfers) {
    if (transfer.status !== "in_transit") continue;
    inTransitByProduct.set(
      transfer.productId,
      (inTransitByProduct.get(transfer.productId) ?? 0) + transfer.quantity
    );
  }
  return [...new Set([...Object.keys(productTotalById), ...allocatedByProduct.keys(), ...inTransitByProduct.keys()])].map((productId) => {
    const total = roundQty(productTotalById[productId] ?? 0);
    const allocated = roundQty(allocatedByProduct.get(productId) ?? 0);
    const reserved = roundQty(reservedByProduct.get(productId) ?? 0);
    const inTransit = roundQty(inTransitByProduct.get(productId) ?? 0);
    return {
      productId,
      total,
      allocated,
      reserved,
      inTransit,
      availableAllocated: roundQty(Math.max(0, allocated - reserved)),
      unallocated: roundQty(Math.max(0, total - allocated - inTransit)),
    };
  });
}

export function hydrateWarehouseState(input: {
  warehouses?: Warehouse[];
  locations?: WarehouseLocation[];
  stock?: WarehouseStockPosition[];
  transfers?: WarehouseTransfer[];
  transferSequence?: number;
}) {
  if (input.warehouses) {
    warehouses.length = 0;
    warehouses.push(...input.warehouses);
  }
  if (input.locations) {
    locations.length = 0;
    locations.push(...input.locations);
  }
  if (input.stock) {
    stock.length = 0;
    stock.push(...input.stock);
  }
  if (input.transfers) {
    transfers.length = 0;
    transfers.push(...input.transfers);
  }
  if (typeof input.transferSequence === "number") transferSequence = input.transferSequence;
}

export function exportWarehouseState() {
  return {
    warehouses: listWarehouses(true),
    locations: locations.map((l) => ({ ...l })),
    stock: stock.map((s) => ({ ...s })),
    transfers: transfers.map((t) => ({ ...t })),
    transferSequence,
  };
}
