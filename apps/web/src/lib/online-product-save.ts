/**
 * Online product form write barrier: no business-local product mutation until
 * authenticated RLS-scoped PostgreSQL acknowledges the requested revision.
 * A stable client mutation ID makes timeout/retry safe for CREATE.
 */
import { configFromEnv, pgInsert, pgSelect, pgUpdate } from "@minarvabiz/database";
import { getSessionToken, getSessionUser, store } from "@minarvabiz/business-logic";
import type { Product } from "@minarvabiz/types";
import { resolveOnlineAuthorization } from "./data-source";
import { productCloudColumns, matchesProductCloudReceipt } from "./online-product-receipt";

export type OnlineProductFields = Pick<Product,
  "name" | "sku" | "barcode" | "categoryId" | "unit" | "costPrice" |
  "sellingPrice" | "stockQuantity" | "minimumStock" | "isActive"
>;

function asRow(input: OnlineProductFields): Record<(typeof productCloudColumns)[number], unknown> {
  return {
    name: input.name, sku: input.sku ?? null, barcode: input.barcode ?? null,
    category_id: input.categoryId ?? null, unit: input.unit,
    cost_price: input.costPrice, selling_price: input.sellingPrice,
    stock_quantity: input.stockQuantity, minimum_stock: input.minimumStock,
    is_active: input.isActive,
  };
}

function toProduct(row: Record<string, unknown>, existing?: Product): Product {
  return {
    ...existing,
    id: String(row.id), name: String(row.name), sku: row.sku as string | null,
    barcode: row.barcode as string | null, categoryId: row.category_id as string | null,
    brand: row.brand as string | null, size: row.size as string | null,
    color: row.color as string | null, fabric: row.fabric as string | null,
    parentProductId: row.parent_product_id as string | null,
    hasVariants: row.has_variants === true,
    unit: String(row.unit), costPrice: Number(row.cost_price),
    sellingPrice: Number(row.selling_price), stockQuantity: Number(row.stock_quantity),
    minimumStock: Number(row.minimum_stock), taxRate: row.tax_rate == null ? null : Number(row.tax_rate),
    discount: row.discount == null ? null : Number(row.discount),
    supplierId: row.supplier_id as string | null,
    imageUrl: row.image_url as string | null, notes: row.notes as string | null,
    isActive: row.is_active === true, branchId: row.branch_id as string | null,
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    deletedAt: row.deleted_at as string | null, version: Number(row.version),
  };
}

export async function saveProductOnline(
  fields: OnlineProductFields,
  options: { createId?: string; editing?: Product } = {},
): Promise<Product> {
  const cfg = configFromEnv();
  const token = getSessionToken();
  const user = getSessionUser();
  if (!cfg || !token || !user?.id) throw new Error("Signed-in Supabase account required for product saving.");
  const auth = await resolveOnlineAuthorization(token, user.id);
  if (!auth.ok) throw new Error(auth.error);

  const editing = options.editing;
  const id = editing?.id ?? options.createId;
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("A stable product identifier is required for cloud saving.");
  }
  if (editing && (fields.stockQuantity !== editing.stockQuantity ||
      !Number.isSafeInteger(editing.version ?? 0) || (editing.version ?? 0) < 1)) {
    throw new Error("Stock adjustments require the authorized stock workflow and a current product version.");
  }
  const version = editing ? (editing.version ?? 1) + 1 : 1;
  const now = new Date().toISOString();
  const row: Record<string, unknown> = {
    ...asRow(fields), updated_at: now,
    ...(editing ? {} : { id, created_at: now }),
    version,
  };
  // org_id may come only from the server's verified current_user_authorization RPC.
  const authCfg = { ...cfg, accessToken: token };
  const ownerFilter = "select=*&id=eq." + id + "&org_id=eq." + auth.orgId + "&limit=2";

  let writeError: string | null = null;
  if (editing) {
    const result = await pgUpdate<Record<string, unknown>>(
      authCfg, "products", "id=eq." + id + "&org_id=eq." + auth.orgId +
      "&version=eq." + editing.version, row,
    );
    writeError = result.error?.message ?? null;
    if (!writeError && result.data?.length === 1 &&
        !matchesProductCloudReceipt(result.data[0], row, id, auth.orgId, version)) {
      writeError = "Server receipt does not match the submitted product update.";
    }
  } else {
    const result = await pgInsert<Record<string, unknown>>(authCfg, "products", {
      ...row, org_id: auth.orgId,
    });
    writeError = result.error?.message ?? null;
    if (!writeError && result.data?.length === 1 &&
        !matchesProductCloudReceipt(result.data[0], row, id, auth.orgId, version)) {
      writeError = "Server receipt does not match the submitted product.";
    }
  }

  // Mandatory server read-back resolves ambiguous network timeouts and prevents
  // a successful HTTP status or zero-row RLS update being mistaken for commit.
  const verified = await pgSelect<Record<string, unknown>>(authCfg, "products", ownerFilter);
  if (verified.error || verified.data?.length !== 1 ||
      !matchesProductCloudReceipt(verified.data[0], row, id, auth.orgId, version)) {
    throw new Error(writeError
      ? "Product NOT confirmed in Supabase: " + writeError + ". Retry this same form, do not create another product."
      : "Product NOT confirmed in Supabase. Check network/access and retry this same form.");
  }
  if (getSessionToken() !== token || getSessionUser()?.id !== user.id) {
    throw new Error("Product committed, but the account changed during save. Sign in again and reload your catalog.");
  }

  const confirmed = toProduct(verified.data[0], editing);
  const current = store.exportCoreState().products;
  store.hydrateCore({ products: current.filter(p => p.id !== id).concat(confirmed) });
  return confirmed;
}
