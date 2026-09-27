import { assertPermission } from "./permissions";
import { touchPersistence } from "./autosave";
import * as store from "./store";
import * as phase5Store from "./phase5-store";
import * as phase6Store from "./phase6-store";
import * as quotations from "./quotations";

export type TrashEntityType = "customer" | "product" | "supplier" | "staff" | "quotation";

export interface RecycleBinSettings {
  retentionDays: number;
}

export interface RecycleBinItem {
  id: string;
  entityType: TrashEntityType;
  entityLabel: string;
  recordLabel: string;
  deletedAt: string;
  purgeAt: string;
}

const DEFAULT_RETENTION_DAYS = 30;
let settings: RecycleBinSettings = { retentionDays: DEFAULT_RETENTION_DAYS };

function normalizeRetentionDays(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_RETENTION_DAYS;
  return Math.min(3650, Math.max(1, Math.round(value)));
}

function purgeAtFor(deletedAt: string): string {
  const deleted = new Date(deletedAt);
  const base = Number.isFinite(deleted.getTime()) ? deleted : new Date();
  base.setUTCDate(base.getUTCDate() + settings.retentionDays);
  return base.toISOString();
}

export function getRecycleBinSettings(): RecycleBinSettings {
  return { ...settings };
}

export function setRecycleBinSettings(patch: Partial<RecycleBinSettings>): RecycleBinSettings {
  assertPermission("settings.manage");
  if (patch.retentionDays !== undefined) settings.retentionDays = normalizeRetentionDays(patch.retentionDays);
  touchPersistence();
  return getRecycleBinSettings();
}

export function exportRecycleBinState(): RecycleBinSettings {
  return getRecycleBinSettings();
}

export function hydrateRecycleBinState(input?: Partial<RecycleBinSettings> | null): void {
  settings = {
    retentionDays: normalizeRetentionDays(input?.retentionDays ?? DEFAULT_RETENTION_DAYS),
  };
}

export function listRecycleBinItems(): RecycleBinItem[] {
  const items: RecycleBinItem[] = [];

  for (const customer of store.listArchivedCustomers()) {
    if (!customer.deletedAt) continue;
    items.push({
      id: customer.id,
      entityType: "customer",
      entityLabel: "Customer",
      recordLabel: customer.name,
      deletedAt: customer.deletedAt,
      purgeAt: purgeAtFor(customer.deletedAt),
    });
  }

  for (const product of store.listArchivedProducts()) {
    if (!product.deletedAt) continue;
    items.push({
      id: product.id,
      entityType: "product",
      entityLabel: "Product",
      recordLabel: product.name,
      deletedAt: product.deletedAt,
      purgeAt: purgeAtFor(product.deletedAt),
    });
  }

  for (const supplier of phase5Store.listArchivedSuppliers()) {
    if (!supplier.deletedAt) continue;
    items.push({
      id: supplier.id,
      entityType: "supplier",
      entityLabel: "Supplier",
      recordLabel: supplier.name,
      deletedAt: supplier.deletedAt,
      purgeAt: purgeAtFor(supplier.deletedAt),
    });
  }

  for (const member of phase6Store.listArchivedStaff()) {
    if (!member.deletedAt) continue;
    items.push({
      id: member.id,
      entityType: "staff",
      entityLabel: "Staff",
      recordLabel: member.name,
      deletedAt: member.deletedAt,
      purgeAt: purgeAtFor(member.deletedAt),
    });
  }

  for (const quotation of quotations.listArchivedQuotations()) {
    if (!quotation.deletedAt) continue;
    items.push({
      id: quotation.id,
      entityType: "quotation",
      entityLabel: "Quotation",
      recordLabel: quotation.quotationNumber + (quotation.customerName ? " · " + quotation.customerName : ""),
      deletedAt: quotation.deletedAt,
      purgeAt: purgeAtFor(quotation.deletedAt),
    });
  }

  return items.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

export function restoreRecycleBinItem(entityType: TrashEntityType, id: string): { ok: boolean; error?: string } {
  assertPermission("settings.manage");
  switch (entityType) {
    case "customer": {
      const result = store.restoreArchivedCustomer(id);
      return result.customer ? { ok: true } : { ok: false, error: result.error || "Unable to restore customer" };
    }
    case "product": {
      const result = store.restoreArchivedProduct(id);
      return result.product ? { ok: true } : { ok: false, error: result.error || "Unable to restore product" };
    }
    case "supplier": {
      const result = phase5Store.restoreArchivedSupplier(id);
      return result.supplier ? { ok: true } : { ok: false, error: result.error || "Unable to restore supplier" };
    }
    case "staff": {
      const result = phase6Store.restoreArchivedStaff(id);
      return result.staff ? { ok: true } : { ok: false, error: result.error || "Unable to restore staff member" };
    }
    case "quotation": {
      const result = quotations.restoreArchivedQuotation(id);
      return result.quotation ? { ok: true } : { ok: false, error: result.error || "Unable to restore quotation" };
    }
  }
}

export function permanentlyDeleteRecycleBinItem(entityType: TrashEntityType, id: string): { ok: boolean; error?: string } {
  assertPermission("settings.manage");
  switch (entityType) {
    case "customer": {
      const result = store.purgeArchivedCustomer(id);
      return result.purged ? { ok: true } : { ok: false, error: result.error || "Unable to permanently delete customer" };
    }
    case "product": {
      const result = store.purgeArchivedProduct(id);
      return result.purged ? { ok: true } : { ok: false, error: result.error || "Unable to permanently delete product" };
    }
    case "supplier": {
      const result = phase5Store.purgeArchivedSupplier(id);
      return result.purged ? { ok: true } : { ok: false, error: result.error || "Unable to permanently delete supplier" };
    }
    case "staff": {
      const result = phase6Store.purgeArchivedStaff(id);
      return result.purged ? { ok: true } : { ok: false, error: result.error || "Unable to permanently delete staff member" };
    }
    case "quotation": {
      const result = quotations.purgeArchivedQuotation(id);
      return result.purged ? { ok: true } : { ok: false, error: result.error || "Unable to permanently delete quotation" };
    }
  }
}

export function purgeExpiredRecycleBinItems(now: Date = new Date()): { purged: number; errors: string[] } {
  assertPermission("settings.manage");
  const cutoff = now.getTime();
  let purged = 0;
  const errors: string[] = [];
  for (const item of listRecycleBinItems()) {
    const purgeAt = new Date(item.purgeAt).getTime();
    if (!Number.isFinite(purgeAt) || purgeAt > cutoff) continue;
    const result = permanentlyDeleteRecycleBinItem(item.entityType, item.id);
    if (result.ok) purged += 1;
    else errors.push(result.error || `Unable to purge ${item.entityLabel} ${item.recordLabel}`);
  }
  return { purged, errors };
}
