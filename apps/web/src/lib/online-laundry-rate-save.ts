/**
 * M13 Supabase-only garment rate-card persistence.
 * A successful UI save requires an RLS-scoped PostgreSQL read-after-write receipt.
 * MIT donor vocabulary: agrayush13/laundry-lo-src@fd48e8ba2dd29b07f3487013f43fdf92f9e67920
 */
import { configFromEnv, pgInsert, pgSelect, pgUpdate } from "@minarvabiz/database";
import {
  can, currentLaundryRateCatalogBranchId, exportLaundryRateCards,
  getOutboxScope, getSessionToken, getSessionUser,
  hydrateLaundryRateCards, validateLaundryRateCards,
  type LaundryRateCard, type LaundryRateInput,
} from "@minarvabiz/business-logic";
import { resolveOnlineAuthorization } from "./data-source";

const table = "laundry_service_rate_cards";
type Row = Record<string, unknown>;
const isUUID = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

async function authenticatedContext() {
  const cfg = configFromEnv();
  const token = getSessionToken();
  const user = getSessionUser();
  if (!cfg || !token || !user?.id) throw new Error("Signed-in Supabase session required.");
  const auth = await resolveOnlineAuthorization(token, user.id);
  if (!auth.ok) throw new Error(auth.error);
  if (getOutboxScope() !== auth.orgId + ":" + user.id) {
    throw new Error("Authenticated tenant scope not ready. Reload and sign in again.");
  }
  return { cfg: { ...cfg, accessToken: token }, token, user, orgId: auth.orgId };
}

function toRate(row: Row): LaundryRateCard {
  return {
    id: String(row.id), branchId: String(row.branch_id),
    mode: String(row.mode) as LaundryRateCard["mode"],
    serviceCode: String(row.service_code) as LaundryRateCard["serviceCode"],
    garment: String(row.garment),
    fabric: String(row.fabric) as LaundryRateCard["fabric"],
    supplierId: row.supplier_id == null ? null : String(row.supplier_id),
    customerRate: Number(row.customer_rate),
    supplierRate: Number(row.supplier_rate),
    tatHours: Number(row.tat_hours),
    updatedAt: String(row.updated_at),
  };
}

export async function loadLaundryRateCardsOnline(): Promise<LaundryRateCard[]> {
  const { cfg, orgId, token, user } = await authenticatedContext();
  const branchId = currentLaundryRateCatalogBranchId();
  if (!branchId || !isUUID(branchId)) throw new Error("Select a valid cloud branch.");
  const branch = await pgSelect<Row>(cfg, "branches",
    "select=id,org_id&id=eq." + branchId + "&org_id=eq." + orgId + "&limit=2");
  if (branch.error || branch.data?.length !== 1) {
    throw new Error("Active cloud branch is not verified for this tenant.");
  }
  const rows = await pgSelect<Row>(cfg, table,
    "select=*&org_id=eq." + orgId + "&branch_id=eq." + branchId +
    "&deleted_at=is.null&limit=10000");
  if (rows.error || !rows.data) {
    throw new Error("Laundry rates NOT loaded from Supabase: " + (rows.error?.message ?? "Empty response"));
  }
  if (getSessionToken() !== token || getSessionUser()?.id !== user.id) {
    throw new Error("Account changed while loading laundry rates.");
  }
  const checked = validateLaundryRateCards(rows.data.map(toRate));
  // A new authenticated session must never retain another tenant’s local rate cache.
  hydrateLaundryRateCards(checked);
  return checked;
}

function equalRow(row: Row | null | undefined, fields: Record<string, unknown>, id: string, orgId: string, version: number, userId: string) {
  if (!row || row.id !== id || row.org_id !== orgId || row.deleted_at != null ||
      row.created_by !== userId || Number(row.version) !== version) return false;
  for (const key of ["branch_id", "mode", "service_code", "garment", "fabric", "supplier_id"]) {
    if ((row[key] ?? null) !== (fields[key] ?? null)) return false;
  }
  for (const key of ["customer_rate", "supplier_rate", "tat_hours"]) {
    if (!Number.isFinite(Number(row[key])) || Number(row[key]) !== Number(fields[key])) return false;
  }
  return true;
}

/** Stable client ID survives ambiguous network failures for INSERT. */
export async function saveLaundryRateOnline(input: LaundryRateInput, stableId: string): Promise<LaundryRateCard> {
  if (!can("settings.manage")) throw new Error("Rate-card administrator permission required.");
  if (!isUUID(stableId)) throw new Error("Stable rate-card identifier is missing.");
  const branchId = currentLaundryRateCatalogBranchId();
  if (!branchId || !isUUID(branchId)) throw new Error("Choose an active cloud branch.");
  const validated = validateLaundryRateCards([{
    ...input, branchId, id: stableId, updatedAt: new Date().toISOString(),
  }])[0];
  const { cfg, orgId, token, user } = await authenticatedContext();

  const branch = await pgSelect<Row>(cfg, "branches",
    "select=id,org_id&id=eq." + branchId + "&org_id=eq." + orgId + "&limit=2");
  if (branch.error || branch.data?.length !== 1) {
    throw new Error("Branch NOT verified as part of the signed-in business.");
  }
  const fields: Record<string, unknown> = {
    branch_id: branchId, mode: validated.mode, service_code: validated.serviceCode,
    garment: validated.garment, fabric: validated.fabric,
    supplier_id: validated.supplierId ?? null,
    customer_rate: validated.customerRate, supplier_rate: validated.supplierRate,
    tat_hours: validated.tatHours,
  };
  const list = await pgSelect<Row>(cfg, table,
    "select=*&org_id=eq." + orgId + "&branch_id=eq." + branchId +
    "&deleted_at=is.null&limit=10000");
  if (list.error || !list.data) throw new Error("Cannot establish current cloud rate revision.");
  const existing = list.data.find(row =>
    row.mode === validated.mode && row.service_code === validated.serviceCode &&
    String(row.garment).trim().toLowerCase() === validated.garment.trim().toLowerCase() &&
    row.fabric === validated.fabric && (row.supplier_id ?? null) === (validated.supplierId ?? null));
  const id = existing ? String(existing.id) : stableId;
  const version = existing ? Number(existing.version) + 1 : 1;
  if (existing && !Number.isSafeInteger(Number(existing.version))) throw new Error("Invalid cloud rate revision.");

  if (!existing) {
    await pgInsert<Row>(cfg, table, {
      id, org_id: orgId, created_by: user.id,
      ...fields, version, updated_at: new Date().toISOString(),
    });
  } else if (!equalRow(existing, fields, id, orgId, Number(existing.version), user.id)) {
    const change = await pgUpdate<Row>(cfg, table,
      "id=eq." + id + "&org_id=eq." + orgId +
      "&version=eq." + existing.version,
      { ...fields, version, updated_at: new Date().toISOString() });
    if (change.error) throw new Error("Cloud rate update rejected: " + change.error.message);
  } else {
    // Exact duplicate retry can complete without creating another transaction,
    // but only after session verification and local cache hydration below.
    if (getSessionToken() !== token || getSessionUser()?.id !== user.id) {
      throw new Error("Account changed before rate receipt could be confirmed.");
    }
    const rate = toRate(existing);
    hydrateLaundryRateCards([rate]);
    return rate;
  }

  const readback = await pgSelect<Row>(cfg, table,
    "select=*&id=eq." + id + "&org_id=eq." + orgId + "&limit=2");
  const confirmed = readback.data?.length === 1 ? readback.data[0] : null;
  if (readback.error || !equalRow(confirmed, fields, id, orgId, version, user.id)) {
    throw new Error("Laundry rate NOT confirmed in Supabase. Retry with the same form.");
  }
  if (getSessionToken() !== token || getSessionUser()?.id !== user.id) {
    throw new Error("Rate committed but account changed. Sign in and reload.");
  }
  const result = toRate(confirmed!);
  const all = exportLaundryRateCards().filter(item => item.branchId === branchId);
  hydrateLaundryRateCards([...all.filter(r => r.id !== id && !(
    r.branchId === result.branchId && r.mode === result.mode &&
    r.serviceCode === result.serviceCode && r.garment.toLowerCase() === result.garment.toLowerCase() &&
    r.fabric === result.fabric && (r.supplierId ?? null) === (result.supplierId ?? null)
  )), result]);
  return result;
}
