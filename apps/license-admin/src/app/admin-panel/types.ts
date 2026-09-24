import type { LicensePlan } from "@minarvabiz/licensing";
import type { Edition, LicenseFeatures } from "@minarvabiz/types";

export type AdminRole = "viewer" | "operator" | "admin";
export type AdminSource = "supabase" | "emergency";
export type AuthStage = "password" | "enroll" | "mfa";
export type LicenseStatusAction = "active" | "suspended" | "revoked" | "deactivated";

export interface AdminIdentityView {
  id: string;
  email: string;
  displayName: string;
  source: AdminSource;
  role: AdminRole;
}

export interface LicenseActivationView {
  activation_id?: string | null;
  device_id?: string | null;
  status?: string | null;
  activated_at?: string | null;
  deactivated_at?: string | null;
  last_validated_at?: string | null;
}

export interface LicenseMetadataView {
  customerName?: string | null;
}

export interface LicenseRegistryRow {
  id: string;
  license_id: string;
  plan: LicensePlan;
  edition: Edition;
  status: string;
  expires_at?: string | null;
  activation_limit: number;
  features?: Partial<LicenseFeatures> | null;
  metadata?: LicenseMetadataView | null;
  activations?: LicenseActivationView[];
}
