/** Phase 3 logical tables: products, categories, inventory, sales, payments */

export const SALES_TABLES = [
  "categories",
  "products",
  "inventory_transactions",
  "sales",
  "sale_items",
  "payments",
  "customers",
] as const;

export interface CategoryRow {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  branchId: string | null;
  version: number;
}

export interface ProductRow {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  categoryId: string | null;
  brand: string | null;
  size: string | null;
  color: string | null;
  unit: string;
  costPrice: number;
  sellingPrice: number;
  discount: number | null;
  taxRate: number | null;
  stockQuantity: number;
  minimumStock: number;
  supplierId: string | null;
  imageUrl: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  branchId: string | null;
  deviceId: string | null;
  version: number;
}

export interface SaleRow {
  id: string;
  invoiceNumber: string;
  customerId: string | null;
  saleDate: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  paidAmount: number;
  balanceAmount: number;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  branchId: string | null;
  deviceId: string | null;
  createdBy: string | null;
  version: number;
}

export interface SaleItemRow {
  id: string;
  saleId: string;
  productId: string;
  productName: string;
  sku: string | null;
  quantity: number;
  unitPrice: number;
  costPrice: number;
  discountPercent: number;
  taxRate: number;
  lineTotal: number;
}

export interface PaymentRow {
  id: string;
  amount: number;
  method: string;
  referenceType: string;
  referenceId: string;
  customerId: string | null;
  notes: string | null;
  paidAt: string;
  createdAt: string;
  createdBy: string | null;
  branchId: string | null;
  deviceId: string | null;
  version: number;
}
