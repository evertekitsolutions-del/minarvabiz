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
