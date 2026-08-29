/** MINARVA BIZ — Shared types (Phase 1 foundation) */
export type UUID = string;
export type ISODateString = string;
export type CurrencyCode = "INR" | "USD" | "EUR" | "GBP" | "AED" | string;
export type Edition = "online" | "offline" | "hybrid";
export type Environment = "development" | "staging" | "production";
export type LicensePlan = "trial" | "basic" | "professional" | "business" | "enterprise";
export type LicenseStatus = "trial" | "active" | "expired" | "suspended" | "revoked" | "deactivated";
export type SyncStatus = "pending" | "synced" | "conflict" | "error";
export type RoleName = "super_admin" | "admin" | "manager" | "cashier" | "tailor" | "staff";
export type OrderStatus = "pending" | "processing" | "ready_to_deliver" | "delivered" | "cancelled";
export type PaymentMethod = "cash" | "card" | "bank" | "upi" | "other";

export interface LicenseFeatures {
  sales: boolean; customers: boolean; inventory: boolean; tailoring: boolean;
  orders: boolean; laundry: boolean; reports: boolean; staff: boolean;
  advancedReports: boolean; cloudSync: boolean; multiUser: boolean;
  multiBranch: boolean; apiAccess: boolean; [key: string]: boolean;
}

export interface LicensePayload {
  licenseId: UUID; customerId: UUID; product: "minarvabiz";
  edition: Edition; plan: LicensePlan; features: LicenseFeatures;
  issuedAt: ISODateString; expiresAt: ISODateString | null;
  activationLimit: number; deviceBindings: string[];
}

export interface User {
  id: UUID; email: string; fullName: string; phone?: string | null;
  role: RoleName; isActive: boolean; branchId?: UUID | null;
  createdAt: ISODateString; updatedAt: ISODateString; deletedAt?: ISODateString | null;
}

export interface Customer {
  id: UUID; name: string; phone?: string | null; whatsapp?: string | null;
  email?: string | null; address?: string | null; birthday?: ISODateString | null;
  notes?: string | null; outstandingBalance: number; totalSpending: number;
  createdAt: ISODateString; updatedAt: ISODateString; deletedAt?: ISODateString | null;
  branchId?: UUID | null;
}

export interface Product {
  id: UUID; name: string; sku?: string | null; barcode?: string | null;
  categoryId?: UUID | null; brand?: string | null; size?: string | null;
  color?: string | null; unit: string; costPrice: number; sellingPrice: number;
  discount?: number | null; taxRate?: number | null; stockQuantity: number;
  minimumStock: number; supplierId?: UUID | null; imageUrl?: string | null;
  notes?: string | null; isActive: boolean;
  createdAt: ISODateString; updatedAt: ISODateString; deletedAt?: ISODateString | null;
  branchId?: UUID | null;
  version?: number;
}

export interface SyncQueueItem {
  id: UUID; tableName: string; recordId: UUID;
  operation: "insert" | "update" | "delete"; payload: Record<string, unknown>;
  deviceId: UUID; createdAt: ISODateString; attempts: number;
  lastError?: string | null; status: SyncStatus;
}

export interface BusinessSettings {
  businessName: string; logoUrl?: string | null; address?: string | null;
  phone?: string | null; email?: string | null; taxEnabled: boolean;
  taxRate?: number | null; taxLabel?: string | null; currency: CurrencyCode;
  dateFormat: string; numberFormat: string; invoicePrefix: string;
}

export interface AppConfig {
  edition: Edition; environment: Environment; version: string; features: LicenseFeatures;
}

export interface DeviceFingerprint {
  hash: string; platform: string; osVersion?: string; collectedAt: ISODateString;
}

// ---------------------------------------------------------------------------
// Phase 3 — Sales, Inventory, Customers, Payments
// ---------------------------------------------------------------------------

export type ProductCategoryName =
  | "Ornaments"
  | "Materials"
  | "Readymade Garments"
  | "Ladies Inners"
  | "Ladies Bags"
  | "Ladies Own Products"
  | string;

export interface Category {
  id: UUID;
  name: string;
  description?: string | null;
  parentId?: UUID | null;
  isActive: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  deletedAt?: ISODateString | null;
  branchId?: UUID | null;
}

export interface InventoryTransaction {
  id: UUID;
  productId: UUID;
  type: "stock_in" | "stock_out" | "adjustment" | "transfer" | "sale" | "return" | "purchase";
  quantity: number;
  unitCost?: number | null;
  referenceType?: string | null;
  referenceId?: UUID | null;
  notes?: string | null;
  createdAt: ISODateString;
  createdBy?: UUID | null;
  branchId?: UUID | null;
  deviceId?: UUID | null;
  version: number;
}

export interface SaleItem {
  id: UUID;
  saleId: UUID;
  productId: UUID;
  productName: string;
  sku?: string | null;
  quantity: number;
  unitPrice: number;
  costPrice: number;
  discountPercent: number;
  taxRate: number;
  lineTotal: number;
}

export interface Sale {
  id: UUID;
  invoiceNumber: string;
  customerId?: UUID | null;
  customerName?: string | null;
  saleDate: ISODateString;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  paidAmount: number;
  balanceAmount: number;
  status: "draft" | "completed" | "partial" | "cancelled" | "returned";
  notes?: string | null;
  items: SaleItem[];
  createdAt: ISODateString;
  updatedAt: ISODateString;
  deletedAt?: ISODateString | null;
  branchId?: UUID | null;
  deviceId?: UUID | null;
  createdBy?: UUID | null;
  version: number;
}

export interface Payment {
  id: UUID;
  amount: number;
  method: PaymentMethod;
  referenceType: "sale" | "order" | "expense" | "supplier" | "refund" | "other";
  referenceId: UUID;
  customerId?: UUID | null;
  notes?: string | null;
  paidAt: ISODateString;
  createdAt: ISODateString;
  createdBy?: UUID | null;
  branchId?: UUID | null;
  deviceId?: UUID | null;
  version: number;
}

export interface CartLine {
  productId: UUID;
  productName: string;
  sku?: string | null;
  barcode?: string | null;
  quantity: number;
  unitPrice: number;
  costPrice: number;
  discountPercent: number;
  taxRate: number;
  stockQuantity: number;
}

// ---------------------------------------------------------------------------
// Phase 4 — Services, Orders, Measurements, Wedding, Bulk, T-shirt
// ---------------------------------------------------------------------------

export type ServiceType =
  | "ladies_tailoring"
  | "gents_tailoring"
  | "ladies_alteration"
  | "gents_alteration"
  | "wedding_dress"
  | "wholesale"
  | "uniform"
  | "tshirt_printing";

export interface MeasurementFields {
  shoulder?: number | null;
  chest?: number | null;
  waist?: number | null;
  hip?: number | null;
  sleeve?: number | null;
  armhole?: number | null;
  length?: number | null;
  neck?: number | null;
  pantLength?: number | null;
  topLength?: number | null;
  bottomLength?: number | null;
  custom?: Record<string, number | string>;
}

export interface MeasurementProfile {
  id: UUID;
  customerId: UUID;
  label: string;
  fields: MeasurementFields;
  notes?: string | null;
  recordedAt: ISODateString;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  deletedAt?: ISODateString | null;
}

export interface OrderExpense {
  id: UUID;
  orderId: UUID;
  description: string;
  amount: number;
  purchaseId?: UUID | null;
  createdAt: ISODateString;
}

export interface TshirtDetails {
  tshirtType?: string | null;
  size?: string | null;
  color?: string | null;
  quantity: number;
  printingType?: string | null;
  designDescription?: string | null;
  printingCost: number;
  customerPrice: number;
}

export interface ServiceOrder {
  id: UUID;
  orderNumber: string;
  customerId: UUID;
  customerName?: string | null;
  orderDate: ISODateString;
  deliveryDate?: ISODateString | null;
  serviceType: ServiceType;
  status: OrderStatus;
  assignedStaffId?: UUID | null;
  assignedTailorId?: UUID | null;
  measurements?: MeasurementFields | null;
  measurementProfileId?: UUID | null;
  notes?: string | null;
  materialDetails?: string | null;
  customerSuppliedMaterial: boolean;
  shopSuppliedMaterial: boolean;
  price: number;
  discount: number;
  advance: number;
  balance: number;
  /** Wedding / custom cost tracking */
  externalMaterialCost: number;
  orderExpensesTotal: number;
  /** Bulk */
  quantity: number;
  unitPrice: number;
  bulkDiscount: number;
  /** T-shirt */
  tshirt?: TshirtDetails | null;
  expenses: OrderExpense[];
  createdAt: ISODateString;
  updatedAt: ISODateString;
  deletedAt?: ISODateString | null;
  branchId?: UUID | null;
  deviceId?: UUID | null;
  createdBy?: UUID | null;
  version: number;
}
