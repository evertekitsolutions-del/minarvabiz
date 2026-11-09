/**
 * Online product form write barrier: no business-local product mutation until
 * authenticated RLS-scoped PostgreSQL acknowledges the requested revision.
 * A stable client mutation ID makes timeout/retry safe for CREATE.
 */
import { configFromEnv, pgInsert, pgRpc, pgSelect, pgUpdate } from "@minarvabiz/database";
import { can, exportOutbox, getOutboxScope, getSessionToken, getSessionUser, planManualStockAdjustment, stockCountDelta, store } from "@minarvabiz/business-logic";
import type { Product, Category } from "@minarvabiz/types";
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
  if (!can("products.manage")) throw new Error("This role cannot save products.");
  const verifiedScope = auth.orgId + ":" + user.id;
  if (getOutboxScope() !== verifiedScope) throw new Error("Cloud tenant context is not ready. Reload your signed-in account.");

  const editing = options.editing;
  const id = editing?.id ?? options.createId;
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("A stable product identifier is required for cloud saving.");
  }
  if (editing && (fields.stockQuantity !== editing.stockQuantity ||
      !Number.isSafeInteger(editing.version ?? 0) || (editing.version ?? 0) < 1)) {
    throw new Error("Stock adjustments require the authorized stock workflow and a current product version.");
  }
  // A pending local revision must not be overwritten by a separate direct SQL
  // path, and an unsettled stock/financial event can supersede this product.
  if (exportOutbox().some(event => event.ownerScope === verifiedScope &&
      (event.status === "pending" || event.status === "failed") &&
      (event.aggregateType === "products" && event.aggregateId === id ||
        !["categories", "customers", "products"].includes(event.aggregateType)))) {
    throw new Error("Pending cloud transactions exist. Reconcile them before saving another product.");
  }
  const version = editing ? (editing.version ?? 1) + 1 : 1;
  const now = new Date().toISOString();
  const row: Record<string, unknown> = {
    ...asRow({ ...fields, stockQuantity: !editing && fields.stockQuantity > 0 ? 0 : fields.stockQuantity }),
    updated_at: now,
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
  const confirmedRow = verified.data?.length === 1 ? verified.data[0] : null;
  // New products enter the catalog with zero stock. Their opening quantity must
  // be applied by the existing atomic stock + inventory-ledger RPC, not by a
  // blind product insert that silently skips the movement history.
  if (!editing && fields.stockQuantity > 0 && confirmedRow &&
      confirmedRow.id === id && confirmedRow.org_id === auth.orgId) {
    if (matchesProductCloudReceipt(confirmedRow, row, id, auth.orgId, 1)) {
      return saveStockAdjustmentOnline(
        toProduct(confirmedRow), String(fields.stockQuantity), id, "opening_stock",
      );
    }
    // If an RPC committed but the response was lost, a retry with this SAME
    // product id must reconcile the committed version-2 + opening ledger row.
    const alreadyPosted = {
      ...row, stock_quantity: fields.stockQuantity, version: 2,
    };
    if (matchesProductCloudReceipt(confirmedRow, alreadyPosted, id, auth.orgId, 2)) {
      const ledger = await pgSelect<Record<string, unknown>>(
        authCfg, "inventory_transactions",
        "select=*&reference_type=eq.opening_stock&reference_id=eq." + id +
        "&org_id=eq." + auth.orgId + "&limit=2",
      );
      const entry = ledger.data?.[0];
      if (!ledger.error && ledger.data?.length === 1 && entry &&
          entry.product_id === id && entry.created_by === user.id &&
          entry.org_id === auth.orgId && entry.movement_type === "adjustment" &&
          Number(entry.quantity) === fields.stockQuantity &&
          Number(entry.balance_after) === fields.stockQuantity) {
        if (getSessionToken() !== token || getSessionUser()?.id !== user.id) {
          throw new Error("Opening stock committed but the signed-in account changed; reload.");
        }
        const postedProduct = toProduct(confirmedRow);
        const currentProducts = store.exportCoreState().products;
        store.hydrateCore({ products: currentProducts.filter(p => p.id !== id).concat(postedProduct) });
        return postedProduct;
      }
    }
  }
  if (verified.error || !confirmedRow ||
      !matchesProductCloudReceipt(confirmedRow, row, id, auth.orgId, version)) {
    throw new Error(writeError
      ? "Product NOT fully confirmed in Supabase: " + writeError + ". Retry this same form, do not create another product."
      : "Product NOT fully confirmed in Supabase. Retry this same form.");
  }
  if (getSessionToken() !== token || getSessionUser()?.id !== user.id) {
    throw new Error("Product committed, but the account changed during save. Sign in again and reload your catalog.");
  }

  const confirmed = toProduct(confirmedRow, editing);
  const current = store.exportCoreState().products;
  store.hydrateCore({ products: current.filter(p => p.id !== id).concat(confirmed) });
  return confirmed;
}

/**
 * Category creation uses the same readback rule as product creation.
 * The request ID must be held by the form across ambiguous network retries.
 */
export async function saveCategoryOnline(
  input: { name: string; description?: string | null },
  stableId: string,
): Promise<Category> {
  const name = input.name.trim();
  if (!name || name.length > 500 || (input.description?.length ?? 0) > 500) {
    throw new Error("Category name or description is invalid.");
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(stableId)) {
    throw new Error("A stable category ID is required.");
  }
  const cfg = configFromEnv();
  const token = getSessionToken();
  const user = getSessionUser();
  if (!cfg || !token || !user?.id) throw new Error("Signed-in online account required.");
  const auth = await resolveOnlineAuthorization(token, user.id);
  if (!auth.ok) throw new Error(auth.error);
  if (!can("products.manage") || getOutboxScope() !== auth.orgId + ":" + user.id) {
    throw new Error("Verified business administrator context required.");
  }
  const now = new Date().toISOString();
  const expected = {
    id: stableId, org_id: auth.orgId, name, description: input.description?.trim() || null,
    is_active: true,
  };
  const authCfg = { ...cfg, accessToken: token };
  const result = await pgInsert<Record<string, unknown>>(authCfg, "categories", {
    ...expected, created_at: now, updated_at: now,
  });
  const confirmed = await pgSelect<Record<string, unknown>>(
    authCfg, "categories",
    "select=*&id=eq." + stableId + "&org_id=eq." + auth.orgId + "&limit=2",
  );
  const row = confirmed.data?.[0];
  if (confirmed.error || confirmed.data?.length !== 1 || !row ||
      row.id !== stableId || row.org_id !== auth.orgId || row.name !== name ||
      (row.description ?? null) !== expected.description || row.is_active !== true ||
      row.deleted_at != null) {
    throw new Error("Category NOT confirmed in Supabase. " +
      (result.error?.message ?? confirmed.error?.message ?? "Retry this same form to avoid duplicates."));
  }
  if (getSessionToken() !== token || getSessionUser()?.id !== user.id) {
    throw new Error("Category committed, but user account changed. Sign in and reload.");
  }
  const category: Category = {
    id: stableId, name, description: expected.description,
    parentId: row.parent_id as string | null,
    isActive: true, createdAt: String(row.created_at),
    updatedAt: String(row.updated_at), deletedAt: null,
    branchId: row.branch_id as string | null,
  };
  const existing = store.exportCoreState().categories;
  store.hydrateCore({ categories: existing.filter(c => c.id !== stableId).concat(category) });
  return category;
}

/**
 * A stock adjustment is one atomic hosted adjust_stock RPC: product balance,
 * optimistic revision and immutable inventory transaction commit together.
 * The reference ID is stable on retry. Never call the RPC using the updated
 * revision, so an ambiguous prior commit cannot be applied a second time.
 */
export async function saveStockAdjustmentOnline(
  original: Product,
  rawTarget: string,
  referenceId: string,
  referenceType: "inventory_adjustment" | "opening_stock" = "inventory_adjustment",
): Promise<Product> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(referenceId)) {
    throw new Error("A stable stock correction reference is required.");
  }
  if (!Number.isSafeInteger(original.version ?? 0) || (original.version ?? 0) < 1) {
    throw new Error("A versioned cloud product is required for stock correction.");
  }
  if (original.hasVariants) throw new Error("Adjust a specific variant, not its product group.");
  const delta = stockCountDelta(rawTarget, original.stockQuantity, original.stockQuantity);
  if (delta === 0) return original;
  const plan = planManualStockAdjustment(original.id, original.branchId, original.stockQuantity, "adjustment", delta);
  const expectedQuantity = plan.next;
  const expectedVersion = (original.version ?? 1) + 1;
  const cfg = configFromEnv();
  const token = getSessionToken();
  const user = getSessionUser();
  if (!cfg || !token || !user?.id) throw new Error("Signed-in Supabase account required.");
  const auth = await resolveOnlineAuthorization(token, user.id);
  if (!auth.ok) throw new Error(auth.error);
  if (!can("inventory.adjust") || getOutboxScope() !== auth.orgId + ":" + user.id) {
    throw new Error("An authorized inventory manager session is required.");
  }
  if (exportOutbox().some(event => event.ownerScope === auth.orgId + ":" + user.id &&
      (event.status === "pending" || event.status === "failed") &&
      (event.aggregateType === "products" && event.aggregateId === original.id ||
       !["categories", "customers", "products"].includes(event.aggregateType)))) {
    throw new Error("Pending cloud transactions must be reconciled before stock correction.");
  }

  const authCfg = { ...cfg, accessToken: token };
  const receipt = await pgRpc<Record<string, unknown>>(authCfg, "adjust_stock", {
    p_product_id: original.id,
    p_movement_type: "adjustment",
    p_quantity: delta,
    p_expected_version: original.version,
    p_reference_type: referenceType,
    p_reference_id: referenceId,
    p_notes: "Manual stock correction",
    p_branch_id: original.branchId ?? null,
    p_device_id: null,
  });
  // Both the committed balance AND the immutable transaction must be
  // independently confirmed. A timeout may occur after the RPC committed.
  const [productRead, movementRead] = await Promise.all([
    pgSelect<Record<string, unknown>>(
      authCfg, "products",
      "select=*&id=eq." + original.id + "&org_id=eq." + auth.orgId + "&limit=2",
    ),
    pgSelect<Record<string, unknown>>(
      authCfg, "inventory_transactions",
      "select=*&reference_id=eq." + referenceId +
      "&reference_type=eq." + referenceType + "&org_id=eq." + auth.orgId + "&limit=2",
    ),
  ]);
  const row = productRead.data?.[0];
  const movement = movementRead.data?.[0];
  if (productRead.error || movementRead.error ||
      productRead.data?.length !== 1 || movementRead.data?.length !== 1 ||
      !row || !movement || row.id !== original.id || row.org_id !== auth.orgId ||
      row.deleted_at != null || Number(row.version) !== expectedVersion ||
      Number(row.stock_quantity) !== expectedQuantity ||
      movement.product_id !== original.id || movement.org_id !== auth.orgId ||
      movement.created_by !== user.id || movement.movement_type !== "adjustment" ||
      Number(movement.quantity) !== delta ||
      Number(movement.balance_after) !== expectedQuantity) {
    throw new Error("Stock correction NOT confirmed in Supabase. " +
      (receipt.error?.message ?? productRead.error?.message ??
       movementRead.error?.message ?? "Retry the SAME correction reference."));
  }
  if (getSessionToken() !== token || getSessionUser()?.id !== user.id) {
    throw new Error("Stock committed but the account changed; sign in and reload.");
  }
  const confirmed = toProduct(row, original);
  const products = store.exportCoreState().products;
  store.hydrateCore({ products: products.filter(p => p.id !== original.id).concat(confirmed) });
  return confirmed;
}
