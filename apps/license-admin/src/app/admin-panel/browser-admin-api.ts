"use client";

import type { Edition, LicenseFeatures } from "@minarvabiz/types";
import type { LicensePlan } from "@minarvabiz/licensing";
import type {
  AdminIdentityView,
  LicenseRegistryRow,
  LicenseStatusAction,
  SupportRequestRow,
  SupportRequestStatus,
} from "./types";
import type { BrowserAdminPendingAuth } from "./browser-admin-auth";
import {
  clearBrowserAdminSession,
  persistBrowserAdminSession,
  readBrowserAdminSession,
  signOutBrowserAdminSession,
} from "./browser-admin-session";
import {
  clearBrowserEmergencySession,
  persistBrowserEmergencySession,
  readBrowserEmergencySession,
  signOutBrowserEmergencySession,
} from "./browser-emergency-session";

import { licenseEdgeOrigin } from "./license-edge-config.ts";

const EDGE = licenseEdgeOrigin();

type ApiResult<T extends object = Record<string, never>> =
  | ({ ok: true } & T)
  | { ok: false; error: string; code?: string };

function errorMessage(data: any, status: number) {
  const explicit = typeof data?.error === "string" ? data.error.trim() : "";
  if (explicit) return explicit.slice(0, 500);
  const code = String(data?.code || "");
  const messages: Record<string, string> = {
    UNAUTHENTICATED: "Administrator session expired. Sign in again.",
    MFA_REQUIRED: "Administrator MFA is required.",
    ADMIN_NOT_ALLOWED: "This account is not an active License Admin.",
    ADMIN_IDENTITY_MISMATCH: "Administrator identity verification failed.",
    ADMIN_ROLE_INVALID: "Administrator role is invalid.",
    FORBIDDEN: "Your administrator role does not allow this action.",
    INVALID_REQUEST: "The request details are invalid.",
    INVALID_ACTIVATION_LIMIT: "The activation limit is invalid for this plan.",
    INVALID_FEATURES: "The selected feature set is invalid for this plan.",
    NOT_FOUND: "The requested record was not found.",
    LICENSE_CONFLICT: "The license could not be created because of a conflict.",
    ACTIVATION_LIMIT_REACHED: "Activation limit reached. Deactivate an existing device first.",
    EXPIRED: "The license has expired.",
    LICENSE_NOT_ACTIVE: "The license is not active.",
    CUSTOMER_ALREADY_EXISTS: "A customer with this email already exists.",
    CUSTOMER_REVIEW_REQUIRED: "This email already exists and requires administrator review.",
    PROVISION_VERIFY_FAILED: "Customer invitation was sent but tenant verification needs review.",
    PROVISION_EMAIL_FAILED: "Customer invitation email could not be sent.",
    ADMIN_SERVICE_TEMPORARILY_UNAVAILABLE: "Administrator service is temporarily unavailable.",
  };
  return messages[code] || `Administrator request failed (${status}).`;
}

async function edgeRequest<T extends object>(
  path: string,
  init: RequestInit = {},
): Promise<ApiResult<T>> {
  const namedSession = readBrowserAdminSession();
  const emergencySession = namedSession ? null : readBrowserEmergencySession();
  const bearer = namedSession?.accessToken || emergencySession?.sessionToken || "";
  if (!bearer) {
    return { ok: false, error: "Administrator session expired. Sign in again.", code: "UNAUTHENTICATED" };
  }

  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  headers.set("authorization", `Bearer ${bearer}`);
  if (init.body != null) headers.set("content-type", "application/json");

  try {
    const response = await fetch(`${EDGE}${path}`, {
      ...init,
      headers,
      cache: "no-store",
      signal: init.signal ?? AbortSignal.timeout(12_000),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.ok !== true) {
      const code = String(data?.code || "");
      if (response.status === 401 || code === "UNAUTHENTICATED") {
        if (namedSession) clearBrowserAdminSession();
        if (emergencySession) clearBrowserEmergencySession();
      }
      return { ok: false, error: errorMessage(data, response.status), code: code || undefined };
    }
    return data as ApiResult<T>;
  } catch {
    return { ok: false, error: "Administrator service is temporarily unavailable." };
  }
}

function validIdentity(value: any): value is AdminIdentityView {
  return Boolean(
    value &&
      typeof value.id === "string" &&
      typeof value.email === "string" &&
      typeof value.displayName === "string" &&
      ["viewer", "operator", "admin"].includes(value.role),
  );
}

export function activateBrowserAdminSession(
  accessToken: string,
  pending: BrowserAdminPendingAuth | null,
) {
  if (!pending) return false;
  clearBrowserEmergencySession();
  return persistBrowserAdminSession({
    accessToken,
    userId: pending.userId,
    supabaseUrl: pending.config.supabaseUrl,
    supabasePublishableKey: pending.config.supabasePublishableKey,
  });
}

export function activateBrowserEmergencySession(input: {
  sessionToken: string;
  identity: AdminIdentityView;
  expiresAt: string;
}) {
  clearBrowserAdminSession();
  return persistBrowserEmergencySession(input);
}

export async function loadBrowserAdminDashboard(): Promise<ApiResult<{
  identity: AdminIdentityView;
  licenses: LicenseRegistryRow[];
  requests: SupportRequestRow[];
}>> {
  const me = await edgeRequest<{ identity: AdminIdentityView }>("/api/admin/me");
  if (!me.ok) return me;
  if (!validIdentity(me.identity)) return { ok: false, error: "Administrator identity response is invalid." };

  const [licenses, support] = await Promise.all([
    edgeRequest<{ licenses: LicenseRegistryRow[] }>("/api/admin/licenses"),
    edgeRequest<{ requests: SupportRequestRow[] }>("/api/admin/support"),
  ]);
  if (!licenses.ok) return licenses;
  if (!support.ok) return support;

  return {
    ok: true,
    identity: {
      ...me.identity,
      source: me.identity.source === "emergency" ? "emergency" : "supabase",
    },
    licenses: Array.isArray(licenses.licenses) ? licenses.licenses : [],
    requests: Array.isArray(support.requests) ? support.requests : [],
  };
}

export async function issueBrowserLicense(input: {
  customerName: string;
  plan: LicensePlan;
  edition: Edition;
  expiresAt?: string | null;
  activationLimit?: number;
  featureOverrides?: Partial<LicenseFeatures>;
}) {
  return edgeRequest<{ token?: string; license?: Record<string, unknown> }>("/api/admin/licenses", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function setBrowserLicenseStatus(licenseId: string, status: LicenseStatusAction) {
  return edgeRequest<{ license?: Record<string, unknown> }>("/api/admin/licenses/status", {
    method: "PATCH",
    body: JSON.stringify({ licenseId, status }),
  });
}

export async function createBrowserOfflineActivation(input: { licenseId: string; deviceId: string }) {
  return edgeRequest<{ filename?: string; content?: string; activationId?: string }>(
    "/api/admin/licenses/offline-activation",
    { method: "POST", body: JSON.stringify(input) },
  );
}

export async function updateBrowserSupportRequest(input: {
  id: string;
  status: SupportRequestStatus;
  assignedTo?: string | null;
  adminNotes?: string | null;
}) {
  return edgeRequest("/api/admin/support", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function provisionBrowserCustomer(input: {
  shopName: string;
  adminName: string;
  email: string;
}) {
  return edgeRequest<{ message?: string; email?: string; userId?: string; orgId?: string }>(
    "/api/admin/customers/provision",
    { method: "POST", body: JSON.stringify(input) },
  );
}

export async function signOutBrowserAdmin() {
  await Promise.all([
    signOutBrowserAdminSession(),
    signOutBrowserEmergencySession(EDGE),
  ]);
}
