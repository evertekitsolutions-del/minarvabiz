import type { Customer, Product, Sale, SaleItem, ServiceOrder, UUID } from "@minarvabiz/types";

export function mapCustomer(row: Record<string, unknown>): Customer {
  return {
    id: row.id as UUID,
    name: String(row.name || ""),
    phone: (row.phone as string) ?? null,
    whatsapp: (row.whatsapp as string) ?? null,
    email: (row.email as string) ?? null,
    address: (row.address as string) ?? null,
    notes: (row.notes as string) ?? null,
    outstandingBalance: Number(row.outstanding_balance || 0),
    totalSpending: Number(row.total_spending || 0),
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
    deletedAt: (row.deleted_at as string) ?? null,
    branchId: (row.branch_id as UUID) ?? null,
    version: Number(row.version || 1),
  };
}

export function customerToRow(c: Partial<Customer>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (c.id !== undefined) row.id = c.id;
  if (c.name !== undefined) row.name = c.name;
  if (c.phone !== undefined) row.phone = c.phone;
  if (c.whatsapp !== undefined) row.whatsapp = c.whatsapp;
  if (c.email !== undefined) row.email = c.email;
  if (c.address !== undefined) row.address = c.address;
  if (c.notes !== undefined) row.notes = c.notes;
  if (c.outstandingBalance !== undefined) row.outstanding_balance = c.outstandingBalance;
  if (c.totalSpending !== undefined) row.total_spending = c.totalSpending;
  if (c.deletedAt !== undefined) row.deleted_at = c.deletedAt;
  if (c.branchId !== undefined) row.branch_id = c.branchId;
  if (c.version !== undefined) row.version = c.version;
  row.updated_at = new Date().toISOString();
  return row;
}

export function mapProduct(row: Record<string, unknown>): Product {
  return {
    id: row.id as UUID,
    name: String(row.name || ""),
    sku: (row.sku as string) ?? null,
    barcode: (row.barcode as string) ?? null,
    categoryId: (row.category_id as UUID) ?? null,
    brand: (row.brand as string) ?? null,
    size: (row.size as string) ?? null,
    color: (row.color as string) ?? null,
    fabric: (row.fabric as string) ?? null,
    parentProductId: (row.parent_product_id as UUID) ?? null,
    hasVariants: row.has_variants === true,
    unit: String(row.unit || "pcs"),
    costPrice: Number(row.cost_price || 0),
    sellingPrice: Number(row.selling_price || 0),
    discount: row.discount == null ? null : Number(row.discount),
    taxRate: row.tax_rate == null ? null : Number(row.tax_rate),
    stockQuantity: Number(row.stock_quantity || 0),
    minimumStock: Number(row.minimum_stock || 0),
    supplierId: (row.supplier_id as UUID) ?? null,
    imageUrl: (row.image_url as string) ?? null,
    notes: (row.notes as string) ?? null,
    isActive: row.is_active !== false,
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
    deletedAt: (row.deleted_at as string) ?? null,
    branchId: (row.branch_id as UUID) ?? null,
    version: Number(row.version || 1),
  } as Product;
}

export function productToRow(p: Partial<Product>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (p.id !== undefined) row.id = p.id;
  if (p.name !== undefined) row.name = p.name;
  if (p.sku !== undefined) row.sku = p.sku;
  if (p.barcode !== undefined) row.barcode = p.barcode;
  if (p.categoryId !== undefined) row.category_id = p.categoryId;
  if (p.brand !== undefined) row.brand = p.brand;
  if (p.size !== undefined) row.size = p.size;
  if (p.color !== undefined) row.color = p.color;
  if (p.fabric !== undefined) row.fabric = p.fabric;
  if (p.parentProductId !== undefined) row.parent_product_id = p.parentProductId;
  if (p.hasVariants !== undefined) row.has_variants = p.hasVariants;
  if (p.unit !== undefined) row.unit = p.unit;
  if (p.costPrice !== undefined) row.cost_price = p.costPrice;
  if (p.sellingPrice !== undefined) row.selling_price = p.sellingPrice;
  if (p.discount !== undefined) row.discount = p.discount;
  if (p.taxRate !== undefined) row.tax_rate = p.taxRate;
  if (p.stockQuantity !== undefined) row.stock_quantity = p.stockQuantity;
  if (p.minimumStock !== undefined) row.minimum_stock = p.minimumStock;
  if (p.supplierId !== undefined) row.supplier_id = p.supplierId;
  if (p.imageUrl !== undefined) row.image_url = p.imageUrl;
  if (p.notes !== undefined) row.notes = p.notes;
  if (p.isActive !== undefined) row.is_active = p.isActive;
  if (p.deletedAt !== undefined) row.deleted_at = p.deletedAt;
  if (p.branchId !== undefined) row.branch_id = p.branchId;
  if (p.version !== undefined) row.version = p.version;
  row.updated_at = new Date().toISOString();
  return row;
}

export function mapSaleItem(row: Record<string, unknown>): SaleItem {
  return {
    id: row.id as UUID,
    saleId: row.sale_id as UUID,
    productId: row.product_id as UUID,
    productName: String(row.product_name || ""),
    sku: (row.sku as string) ?? null,
    quantity: Number(row.quantity || 0),
    unitPrice: Number(row.unit_price || 0),
    costPrice: Number(row.cost_price || 0),
    discountPercent: Number(row.discount_percent || 0),
    taxRate: Number(row.tax_rate || 0),
    lineTotal: Number(row.line_total || 0),
  };
}

export function mapSale(row: Record<string, unknown>, items: SaleItem[] = []): Sale {
  return {
    id: row.id as UUID,
    invoiceNumber: String(row.invoice_number || ""),
    customerId: (row.customer_id as UUID) ?? null,
    customerName: (row.customer_name as string) ?? null,
    saleDate: String(row.sale_date || new Date().toISOString()),
    subtotal: Number(row.subtotal || 0),
    discountAmount: Number(row.discount_amount || 0),
    taxAmount: Number(row.tax_amount || 0),
    total: Number(row.total || 0),
    paidAmount: Number(row.paid_amount || 0),
    balanceAmount: Number(row.balance_amount || 0),
    status: (row.status as Sale["status"]) || "completed",
    notes: (row.notes as string) ?? null,
    items,
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
    deletedAt: (row.deleted_at as string) ?? null,
    branchId: (row.branch_id as UUID) ?? null,
    version: Number(row.version || 1),
  };
}

export function mapOrder(row: Record<string, unknown>): ServiceOrder {
  let measurements = null;
  if (typeof row.measurements_json === "string") {
    try { measurements = JSON.parse(row.measurements_json); } catch { measurements = null; }
  } else if (row.measurements_json && typeof row.measurements_json === "object") {
    measurements = row.measurements_json;
  }
  let tshirt = null;
  if (typeof row.tshirt_json === "string") {
    try { tshirt = JSON.parse(row.tshirt_json); } catch { tshirt = null; }
  } else if (row.tshirt_json && typeof row.tshirt_json === "object") {
    tshirt = row.tshirt_json;
  }
  return {
    id: row.id as UUID,
    orderNumber: String(row.order_number || ""),
    customerId: row.customer_id as UUID,
    customerName: (row.customer_name as string) ?? null,
    orderDate: String(row.order_date || new Date().toISOString()),
    deliveryDate: (row.delivery_date as string) ?? null,
    serviceType: row.service_type as ServiceOrder["serviceType"],
    status: row.status as ServiceOrder["status"],
    assignedStaffId: (row.assigned_staff_id as UUID) ?? null,
    assignedTailorId: (row.assigned_tailor_id as UUID) ?? null,
    measurementProfileId: (row.measurement_profile_id as UUID) ?? null,
    measurements,
    notes: (row.notes as string) ?? null,
    materialDetails: (row.material_details as string) ?? null,
    customerSuppliedMaterial: row.customer_supplied_material === true,
    shopSuppliedMaterial: row.shop_supplied_material !== false,
    price: Number(row.price || 0),
    discount: Number(row.discount || 0),
    advance: Number(row.advance || 0),
    balance: Number(row.balance || 0),
    externalMaterialCost: Number(row.external_material_cost || 0),
    orderExpensesTotal: Number(row.order_expenses_total || 0),
    quantity: Number(row.quantity || 1),
    unitPrice: Number(row.unit_price || 0),
    bulkDiscount: Number(row.bulk_discount || 0),
    tshirt,
    expenses: [],
    createdAt: String(row.created_at || new Date().toISOString()),
    updatedAt: String(row.updated_at || new Date().toISOString()),
    deletedAt: (row.deleted_at as string) ?? null,
    branchId: (row.branch_id as UUID) ?? null,
    deviceId: (row.device_id as UUID) ?? null,
    createdBy: (row.created_by as UUID) ?? null,
    version: Number(row.version || 1),
  } as ServiceOrder;
}
