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


export type SupportRequestType = "technical_escalation" | "bug" | "feature_request" | "suggestion";
export type SupportRequestStatus = "new" | "in_review" | "planned" | "resolved" | "rejected" | "duplicate";
export type SupportRequestPriority = "low" | "normal" | "high" | "urgent";

export interface SupportRequestRow {
  id: string;
  request_type: SupportRequestType;
  status: SupportRequestStatus;
  priority: SupportRequestPriority;
  title: string;
  description: string;
  module?: string | null;
  organization_name?: string | null;
  contact_email?: string | null;
  app_version?: string | null;
  edition?: string | null;
  platform?: string | null;
  ai_summary?: string | null;
  screenshot_summary?: string | null;
  transcript?: Array<{ role?: string; content?: string }>;
  metadata?: Record<string, unknown> | null;
  assigned_to?: string | null;
  admin_notes?: string | null;
  created_at: string;
  updated_at: string;
  resolved_at?: string | null;
}
