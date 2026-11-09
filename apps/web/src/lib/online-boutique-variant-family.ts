/**
 * M6 boutique variant matrix: one invoker-scoped PostgreSQL transaction writes
 * parent, all variants, and their opening inventory receipts.
 * Open Mercato MIT variant option mapping is shared via business-logic.
 */
import { configFromEnv, mapProduct, pgRpc, pgSelect } from "@minarvabiz/database";
import {
  can, exportOutbox, getOutboxScope, getSessionToken, getSessionUser,
  parseProductVariants, store,
} from "@minarvabiz/business-logic";
import type { Product } from "@minarvabiz/types";
import { resolveOnlineAuthorization } from "./data-source";

export interface BoutiqueVariantInput {
  id: string;
  brand: string; fabric: string; color: string; size: string;
  sku: string; barcode: string;
  costPrice: number; sellingPrice: number; stockQuantity: number;
}
export interface BoutiqueVariantFamilyInput {
  parentId: string;
  name: string;
  sku: string;
  categoryId: string | null;
  minimumStock: number;
  variants: readonly BoutiqueVariantInput[];
}

const isUUID = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

function validCurrency(value: number) {
  return Number.isFinite(value) && value >= 0 && value <= 999999999999 &&
    Math.round(value * 100) === value * 100;
}
function matchesVariant(row: Record<string, unknown>, submitted: BoutiqueVariantInput, parent: string, org: string) {
  return row.id === submitted.id && row.org_id === org && row.parent_product_id === parent &&
    row.has_variants === false && row.deleted_at == null && Number(row.version) === 1 &&
    (row.brand ?? "") === submitted.brand.trim() &&
    (row.fabric ?? "") === submitted.fabric.trim() &&
    (row.color ?? "") === submitted.color.trim() &&
    (row.size ?? "") === submitted.size.trim() &&
    row.sku === submitted.sku.trim() && row.barcode === submitted.barcode.trim() &&
    Number(row.cost_price) === submitted.costPrice &&
    Number(row.selling_price) === submitted.sellingPrice &&
    Number(row.stock_quantity) === submitted.stockQuantity;
}

export async function createBoutiqueVariantFamilyOnline(
  input: BoutiqueVariantFamilyInput
): Promise<{ parent: Product; variants: Product[] }> {
  const cfg = configFromEnv();
  const token = getSessionToken();
  const user = getSessionUser();
  if (!cfg || !token || !user?.id) throw new Error("Signed-in Supabase session required.");
  const auth = await resolveOnlineAuthorization(token, user.id);
  if (!auth.ok) throw new Error(auth.error);
  if (!can("products.manage") || getOutboxScope() !== auth.orgId + ":" + user.id) {
    throw new Error("Verified tenant product-administrator scope required.");
  }
  if (!isUUID(input.parentId) || input.variants.length < 1 || input.variants.length > 100 ||
      !input.name.trim() || input.name.length > 200 ||
      !Number.isFinite(input.minimumStock) || input.minimumStock < 0) {
    throw new Error("Invalid product group or variant matrix.");
  }
  const ids = new Set([input.parentId]);
  const skuCodes = new Set<string>();
  const barcodeCodes = new Set<string>();
  for (const variant of input.variants) {
    if (!isUUID(variant.id) || ids.has(variant.id) ||
        !variant.sku.trim() || !variant.barcode.trim() ||
        skuCodes.has(variant.sku.trim().toLowerCase()) ||
        barcodeCodes.has(variant.barcode.trim().toLowerCase()) ||
        !validCurrency(variant.costPrice) || !validCurrency(variant.sellingPrice) ||
        !Number.isSafeInteger(variant.stockQuantity) ||
        variant.stockQuantity < 0 || variant.stockQuantity > 999999999) {
      throw new Error("Duplicate identifier, unsafe price or invalid variant quantity.");
    }
    ids.add(variant.id);
    skuCodes.add(variant.sku.trim().toLowerCase());
    barcodeCodes.add(variant.barcode.trim().toLowerCase());
  }
  parseProductVariants(input.variants.map(variant => ({
    brand: variant.brand, material: variant.fabric, size: variant.size, color: variant.color,
    sku: variant.sku, barcode: variant.barcode,
    quantity: String(variant.stockQuantity),
  })));
  const scope = auth.orgId + ":" + user.id;
  if (exportOutbox().some(event => event.ownerScope === scope &&
    (event.status === "pending" || event.status === "failed"))) {
    throw new Error("Pending cloud transactions must be reconciled before variant stock creation.");
  }

  const authCfg = { ...cfg, accessToken: token };
  const rpc = await pgRpc<Record<string, unknown>>(authCfg, "create_boutique_variant_family", {
    p_parent_id: input.parentId,
    p_name: input.name.trim(),
    p_sku: input.sku.trim() || null,
    p_category_id: input.categoryId,
    p_unit: "pcs",
    p_minimum_stock: input.minimumStock,
    p_variants: input.variants.map(item => ({
      id: item.id, brand: item.brand.trim(), fabric: item.fabric.trim(),
      color: item.color.trim(), size: item.size.trim(),
      sku: item.sku.trim(), barcode: item.barcode.trim(),
      cost_price: item.costPrice, selling_price: item.sellingPrice,
      stock_quantity: item.stockQuantity,
    })),
  });
  const keys = [...ids].join(",");
  const [products, movements] = await Promise.all([
    pgSelect<Record<string, unknown>>(authCfg, "products",
      "select=*&org_id=eq." + auth.orgId + "&id=in.(" + keys + ")&limit=101"),
    pgSelect<Record<string, unknown>>(authCfg, "inventory_transactions",
      "select=*&org_id=eq." + auth.orgId +
      "&reference_type=eq.opening_stock&reference_id=in.(" +
      input.variants.map(v => v.id).join(",") + ")&limit=101"),
  ]);
  const matches = products.data;
  const parentRow = matches?.find(row => row.id === input.parentId);
  const childRows = input.variants.map(item => matches?.find(row => row.id === item.id));
  const quantitySum = input.variants.reduce((sum, item) => sum + item.stockQuantity, 0);
  const confirmed = !products.error && !movements.error && matches?.length === ids.size &&
    parentRow?.org_id === auth.orgId && parentRow.has_variants === true &&
    parentRow.parent_product_id == null && parentRow.deleted_at == null &&
    parentRow.name === input.name.trim() &&
    Number(parentRow.stock_quantity) === quantitySum &&
    Number(rpc.data?.stock_quantity ?? quantitySum) === quantitySum &&
    childRows.every((row, i) => row && matchesVariant(row, input.variants[i], input.parentId, auth.orgId)) &&
    input.variants.every(v => v.stockQuantity === 0 ||
      movements.data?.filter(m => m.reference_id === v.id && m.product_id === v.id &&
        m.reference_type === "opening_stock" && m.org_id === auth.orgId &&
        Number(m.quantity) === v.stockQuantity && Number(m.balance_after) === v.stockQuantity
      ).length === 1);
  if (!confirmed) {
    throw new Error("Boutique parent/variant stock NOT confirmed in Supabase. " +
      (rpc.error?.message ?? products.error?.message ?? movements.error?.message ??
      "Retry the SAME variant matrix to prevent duplicates."));
  }
  if (getSessionToken() !== token || getSessionUser()?.id !== user.id) {
    throw new Error("Variant family committed, but signed-in user changed. Reload the catalog.");
  }

  const confirmedProducts = [parentRow!, ...childRows as Record<string, unknown>[]].map(mapProduct);
  const current = store.exportCoreState().products;
  store.hydrateCore({
    products: current.filter(row => !ids.has(row.id)).concat(confirmedProducts),
  });
  return { parent: confirmedProducts[0], variants: confirmedProducts.slice(1) };
}
