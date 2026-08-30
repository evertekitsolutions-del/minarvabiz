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
export type OrderStatus = "pending" | "received" | "cutting" | "stitching" | "alteration" | "qc" | "processing" | "ready_to_deliver" | "delivered" | "cancelled";
export type PaymentMethod = "cash" | "card" | "bank" | "upi" | "online" | "other";

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

// ---------------------------------------------------------------------------
// Phase 5 — Laundry, Ironing, Suppliers, Expenses, Purchases
// ---------------------------------------------------------------------------

export type ExpenseCategoryName =
  | "Salary"
  | "Electricity"
  | "Rent"
  | "Normal Water"
  | "Drinking Water"
  | "Shop Supplies"
  | "Transportation"
  | "Maintenance"
  | "Other"
  | string;

export interface Supplier {
  id: UUID;
  name: string;
  company?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  category?: string | null; // laundry, materials, general
  openingBalance: number;
  outstandingBalance: number;
  notes?: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  deletedAt?: ISODateString | null;
  branchId?: UUID | null;
}

export interface LaundryOrder {
  id: UUID;
  orderNumber: string;
  customerId: UUID;
  customerName?: string | null;
  garment?: string | null;
  quantity: number;
  /** outsourced vs in-house ironing */
  mode: "outsourced" | "in_house_ironing";
  supplierId?: UUID | null;
  supplierName?: string | null;
  supplierRate: number;
  customerRate: number;
  profit: number;
  totalCustomerCharge: number;
  totalSupplierCost: number;
  status: "pending" | "sent" | "received" | "delivered" | "cancelled";
  orderReference?: string | null;
  notes?: string | null;
  paidAmount: number;
  balanceAmount: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  deletedAt?: ISODateString | null;
  branchId?: UUID | null;
  deviceId?: UUID | null;
  version: number;
}

export interface ExpenseCategory {
  id: UUID;
  name: string;
  isSystem: boolean;
  createdAt: ISODateString;
}

export interface Expense {
  id: UUID;
  date: ISODateString;
  categoryId: UUID;
  categoryName?: string | null;
  amount: number;
  paymentMethod: PaymentMethod;
  description?: string | null;
  receiptUrl?: string | null;
  staffId?: UUID | null;
  reference?: string | null;
  /** Link to order if order-specific */
  orderId?: UUID | null;
  orderNumber?: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  deletedAt?: ISODateString | null;
  createdBy?: UUID | null;
  branchId?: UUID | null;
  deviceId?: UUID | null;
  version: number;
}

export interface Purchase {
  id: UUID;
  purchaseNumber: string;
  date: ISODateString;
  supplierId?: UUID | null;
  supplierName?: string | null;
  description: string;
  amount: number;
  paymentMethod: PaymentMethod;
  paidAmount: number;
  balanceAmount: number;
  /** general shop stock vs order-specific */
  kind: "general" | "order_specific";
  orderId?: UUID | null;
  orderNumber?: string | null;
  notes?: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  deletedAt?: ISODateString | null;
  createdBy?: UUID | null;
  branchId?: UUID | null;
  deviceId?: UUID | null;
  version: number;
}

// ---------------------------------------------------------------------------
// Phase 6 — Staff, Assignments, Incentives, CRM, Notifications
// ---------------------------------------------------------------------------

export type StaffStatus = "active" | "inactive" | "on_leave";

export interface StaffMember {
  id: UUID;
  name: string;
  phone?: string | null;
  email?: string | null;
  role: RoleName | "tailor" | "staff";
  salary: number;
  joiningDate?: ISODateString | null;
  status: StaffStatus;
  notes?: string | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  deletedAt?: ISODateString | null;
  branchId?: UUID | null;
}

export interface StaffAssignment {
  id: UUID;
  staffId: UUID;
  staffName?: string | null;
  orderId: UUID;
  orderNumber?: string | null;
  serviceType?: string | null;
  assignedAt: ISODateString;
  completedAt?: ISODateString | null;
  status: "assigned" | "in_progress" | "completed" | "cancelled";
  notes?: string | null;
}

export interface IncentiveRuleRecord {
  id: UUID;
  name: string;
  serviceType?: string | null; // null = all
  type: "fixed" | "percentage";
  value: number;
  isActive: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface StaffIncentivePayout {
  id: UUID;
  staffId: UUID;
  staffName?: string | null;
  orderId: UUID;
  orderNumber?: string | null;
  ruleId?: UUID | null;
  amount: number;
  calculatedAt: ISODateString;
  paid: boolean;
  paidAt?: ISODateString | null;
}

export type NotificationKind =
  | "low_stock"
  | "order_ready"
  | "pending_delivery"
  | "payment_due"
  | "license_expiry"
  | "sync_error"
  | "backup_reminder"
  | "order_received"
  | "promotional"
  | "system";

export interface AppNotification {
  id: UUID;
  kind: NotificationKind;
  title: string;
  body: string;
  href?: string | null;
  read: boolean;
  createdAt: ISODateString;
  meta?: Record<string, unknown>;
}

/** CRM view model — customer with history aggregates */
export interface CustomerCrmProfile {
  customer: Customer;
  measurementCount: number;
  orderCount: number;
  saleCount: number;
  recentOrders: Array<{ id: UUID; orderNumber: string; status: string; price: number; date: string }>;
  recentSales: Array<{ id: UUID; invoiceNumber: string; total: number; date: string }>;
}

// ---------------------------------------------------------------------------
// Phase 7 — Returns, Audit, Backup, Reports
// ---------------------------------------------------------------------------

export type ReturnReason =
  | "defective"
  | "wrong_item"
  | "customer_changed_mind"
  | "size_issue"
  | "other";

export interface SaleReturnItem {
  id: UUID;
  returnId: UUID;
  saleItemId: UUID;
  productId: UUID;
  productName: string;
  quantity: number;
  unitPrice: number;
  refundAmount: number;
  restock: boolean;
}

export interface SaleReturn {
  id: UUID;
  returnNumber: string;
  saleId: UUID;
  invoiceNumber: string;
  customerId?: UUID | null;
  customerName?: string | null;
  reason: ReturnReason;
  notes?: string | null;
  totalRefund: number;
  refundMethod: PaymentMethod;
  status: "completed" | "pending" | "cancelled";
  items: SaleReturnItem[];
  createdAt: ISODateString;
  createdBy?: UUID | null;
  branchId?: UUID | null;
  deviceId?: UUID | null;
  version: number;
}

export interface AuditLogEntry {
  id: UUID;
  userId?: UUID | null;
  userName?: string | null;
  action: string;
  tableName?: string | null;
  recordId?: UUID | null;
  oldValue?: string | null;
  newValue?: string | null;
  ipAddress?: string | null;
  createdAt: ISODateString;
}

export interface BackupMeta {
  id: UUID;
  filename: string;
  createdAt: ISODateString;
  sizeBytes: number;
  kind: "manual" | "automatic";
  verified: boolean;
  location: "local" | "download";
}

export interface ReportFilters {
  from?: ISODateString;
  to?: ISODateString;
  categoryId?: UUID | null;
  staffId?: UUID | null;
}

export interface SalesReportRow {
  label: string;
  productSales: number;
  serviceRevenue: number;
  laundryRevenue: number;
  totalRevenue: number;
  expenses: number;
  netProfit: number;
}


// ---------------------------------------------------------------------------
// Phase 8 — Sync, conflict, offline queue
// ---------------------------------------------------------------------------

export type ConflictStrategy = "last_write_wins" | "manual" | "server_wins" | "client_wins";

export interface ConflictRecord {
  id: UUID;
  tableName: string;
  recordId: UUID;
  localVersion: number;
  remoteVersion: number;
  localPayload: Record<string, unknown>;
  remotePayload: Record<string, unknown>;
  strategy: ConflictStrategy;
  resolution?: "local" | "remote" | "merged" | null;
  resolvedAt?: ISODateString | null;
  createdAt: ISODateString;
}

export interface SyncSession {
  id: UUID;
  deviceId: UUID;
  startedAt: ISODateString;
  finishedAt?: ISODateString | null;
  pushed: number;
  pulled: number;
  conflicts: number;
  errors: number;
  status: "running" | "completed" | "failed";
  lastError?: string | null;
}

export interface DeviceRegistration {
  id: UUID;
  deviceName: string;
  platform: "web" | "windows" | "android" | "ios";
  lastSyncAt?: ISODateString | null;
  isOnline: boolean;
  createdAt: ISODateString;
}

export interface OutboxEvent {
  id: UUID;
  aggregateType: string;
  aggregateId: UUID;
  eventType: string;
  payload: Record<string, unknown>;
  occurredAt: ISODateString;
  deviceId: UUID;
  sequence: number;
  status: SyncStatus;
  attempts: number;
  lastError?: string | null;
}


// ---------------------------------------------------------------------------
// Phase 9 — Branches, license runtime
// ---------------------------------------------------------------------------

export interface Branch {
  id: UUID;
  name: string;
  code?: string | null;
  address?: string | null;
  phone?: string | null;
  isHeadquarters: boolean;
  isActive: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  deletedAt?: ISODateString | null;
}

export interface LicenseRuntimeSnapshot {
  status: string;
  plan: LicensePlan | null;
  edition: Edition | null;
  daysRemaining: number | null;
  graceDaysRemaining: number | null;
  reason?: string | null;
  features: LicenseFeatures | null;
  activeBranchId?: UUID | null;
}

export type QuotationStatus = "draft" | "sent" | "accepted" | "rejected" | "expired" | "converted";

export interface QuotationLine {
  id: UUID;
  kind: "product" | "service" | "material" | "labour";
  productId?: UUID | null;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Quotation {
  id: UUID;
  quotationNumber: string;
  customerId: UUID;
  customerName?: string | null;
  status: QuotationStatus;
  lines: QuotationLine[];
  materialCharges: number;
  labourCharges: number;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  advance: number;
  balance: number;
  validUntil?: ISODateString | null;
  notes?: string | null;
  convertedSaleId?: UUID | null;
  convertedOrderId?: UUID | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  deletedAt?: ISODateString | null;
  version: number;
  orgId?: UUID | null;
}

export interface LedgerEntry {
  id: UUID;
  partyType: "customer" | "supplier";
  partyId: UUID;
  entryType: "sale" | "payment" | "refund" | "advance" | "purchase" | "purchase_return" | "opening" | "adjustment";
  referenceType?: string | null;
  referenceId?: UUID | null;
  debit: number;
  credit: number;
  balanceAfter: number;
  notes?: string | null;
  createdAt: ISODateString;
}

export interface CashRegisterSession {
  id: UUID;
  businessDate: string;
  openingCash: number;
  cashSales: number;
  cashReceived: number;
  cashExpenses: number;
  cashRefunds: number;
  expectedClosing: number;
  actualClosing?: number | null;
  difference?: number | null;
  openedAt: ISODateString;
  closedAt?: ISODateString | null;
  closedBy?: string | null;
  status: "open" | "closed";
}
