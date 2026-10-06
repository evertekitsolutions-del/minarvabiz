import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildOfflineActivationPackage,
  isLicenseStatusAction,
  LICENSE_STATUS_ACTIONS,
} from "../apps/license-admin/src/app/action-contract.ts";

for (const status of ["active", "suspended", "revoked", "deactivated"]) {
  assert.equal(isLicenseStatusAction(status), true);
}
for (const status of ["deleted", "pending", "", null, 123]) {
  assert.equal(isLicenseStatusAction(status), false);
}
assert.deepEqual([...LICENSE_STATUS_ACTIONS], ["active", "suspended", "revoked", "deactivated"]);

const exportedPackage = buildOfflineActivationPackage({
  licenseToken: "license-token",
  activationCertificate: "activation-certificate",
  licenseId: "LIC-TEST-001",
  activationId: "ACT-TEST-001",
  deviceId: "a".repeat(64),
  issuedAt: "2026-09-25T00:00:00.000Z",
  expiresAt: null,
});
const importedPackage = JSON.parse(JSON.stringify(exportedPackage));
assert.deepEqual(importedPackage, exportedPackage);
assert.equal(importedPackage.format, "minarvabiz-license-v1");
assert.equal(importedPackage.product, "minarvabiz");
assert.equal(importedPackage.deviceId.length, 64);

const actions = await readFile(
  new URL("../apps/license-admin/src/app/actions.ts", import.meta.url),
  "utf8",
);

for (const authAction of ["loginEmergencyAdmin", "logoutEmergencyAdmin"]) {
  assert.match(actions, new RegExp(`export async function ${authAction}\\b`));
}
for (const retiredAction of [
  "loginAdmin",
  "beginAdminMfaEnrollment",
  "verifyAdminMfa",
  "cancelAdminMfa",
  "adoptCloudflareAdminSession",
  "logoutAdmin",
  "firstAdminBootstrapStatus",
  "bootstrapFirstLicenseAdmin",
]) {
  assert.doesNotMatch(actions, new RegExp(`export async function ${retiredAction}\\b`));
}
assert.doesNotMatch(actions, /from ["']\.\.\/lib\/named-admin["']/);
assert.match(
  actions,
  /export async function logoutEmergencyAdmin\(\)[\s\S]*claims\?\.identity\.source === "emergency"/,
  "Legacy server logout must be explicitly restricted to emergency sessions",
);

for (const registryAction of [
  "listLicenses",
  "createCommercialLicense",
  "createOfflineActivationPackage",
  "setLicenseStatus",
]) {
  assert.match(actions, new RegExp(`export async function ${registryAction}\\b`));
}

assert.match(
  actions,
  /if \(!activationResult\.ok\) return \{ ok: false, error: activationResult\.error \|\| "License activation lookup failed\.", identity, licenses: \[\] as any\[\] \};/,
  "Registry read must fail closed when activation lookup fails",
);
assert.match(
  actions,
  /if \(!cleanLicenseId \|\| !isLicenseStatusAction\(status\)\) return \{ ok: false, error: "Invalid license status\." \};/,
  "Status writes must validate runtime input before the database PATCH",
);
assert.match(actions, /buildOfflineActivationPackage\(\{/);
assert.match(actions, /filename: `MinarvaBiz-\$\{license\.license_id\}-\$\{deviceId\.slice\(0, 8\)\}\.lic`/);

const page = await readFile(
  new URL("../apps/license-admin/src/app/page.tsx", import.meta.url),
  "utf8",
);
const panel = await readFile(
  new URL("../apps/license-admin/src/app/AdminPanel.tsx", import.meta.url),
  "utf8",
);
const browserAuth = await readFile(
  new URL("../apps/license-admin/src/app/admin-panel/browser-admin-auth.ts", import.meta.url),
  "utf8",
);
const browserApi = await readFile(
  new URL("../apps/license-admin/src/app/admin-panel/browser-admin-api.ts", import.meta.url),
  "utf8",
);
const browserSession = await readFile(
  new URL("../apps/license-admin/src/app/admin-panel/browser-admin-session.ts", import.meta.url),
  "utf8",
);
const browserEmergencySession = await readFile(
  new URL("../apps/license-admin/src/app/admin-panel/browser-emergency-session.ts", import.meta.url),
  "utf8",
);
const browserEmergencyAuth = await readFile(
  new URL("../apps/license-admin/src/app/admin-panel/browser-emergency-auth.ts", import.meta.url),
  "utf8",
);
const authHook = await readFile(
  new URL("../apps/license-admin/src/app/admin-panel/useAdminAuthentication.ts", import.meta.url),
  "utf8",
);
const bootstrapHook = await readFile(
  new URL("../apps/license-admin/src/app/admin-panel/useFirstAdminBootstrap.ts", import.meta.url),
  "utf8",
);
const authCard = await readFile(
  new URL("../apps/license-admin/src/app/admin-panel/AdminAuthCard.tsx", import.meta.url),
  "utf8",
);

assert.equal(page.includes('export const dynamic = "force-dynamic";'), true, "license-admin page must remain request-bound for CSP nonces");
for (const forbidden of ["readAdminSessionToken", "cookies(", "listLicenses(", "listSupportRequests("]) {
  assert.equal(page.includes(forbidden), false, `page must not contain ${forbidden}`);
}
for (const expected of ["identity={null}", "initialLicenses={[]}", "initialSupportRequests={[]}"]) {
  assert.equal(page.includes(expected), true, `page must contain ${expected}`);
}

assert.equal(browserAuth.includes("/token?grant_type=password"), true);
assert.doesNotMatch(browserAuth, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|LICENSE_SESSION_SECRET|LICENSE_EDGE_RPC_SECRET/);
for (const expected of [
  "beginBrowserNamedAdminLogin",
  "beginBrowserEmergencyLogin",
  "activateBrowserAdminSession",
  "activateBrowserEmergencySession",
  "loadBrowserAdminDashboard",
]) assert.equal(authHook.includes(expected), true, `auth hook must contain ${expected}`);
assert.equal(authHook.includes("loginEmergencyAdmin"), false);
assert.equal(browserSession.includes("sessionStorage.setItem"), true);
assert.equal(browserEmergencySession.includes("sessionStorage.setItem"), true);
assert.equal(browserEmergencyAuth.includes("/api/admin/emergency/login"), true);
for (const route of [
  "/api/admin/me",
  "/api/admin/licenses",
  "/api/admin/licenses/status",
  "/api/admin/licenses/offline-activation",
  "/api/admin/support",
  "/api/admin/customers/provision",
]) assert.ok(browserApi.includes(route), `browser admin API must call ${route}`);
assert.match(panel, /issueBrowserLicense/);
assert.match(panel, /setBrowserLicenseStatus/);
assert.match(panel, /createBrowserOfflineActivation/);
assert.match(panel, /signOutBrowserAdmin/);
assert.equal(panel.includes('from "./actions"'), false);
assert.doesNotMatch(panel, /createCommercialLicense|setLicenseStatus|createOfflineActivationPackage|logoutEmergencyAdmin/);
assert.match(panel, /Blob|createObjectURL/);

const browserStorage = new Map();
Object.defineProperty(globalThis, "sessionStorage", {
  configurable: true,
  value: {
    getItem(key) {
      return browserStorage.has(key) ? browserStorage.get(key) : null;
    },
    setItem(key, value) {
      browserStorage.set(String(key), String(value));
    },
    removeItem(key) {
      browserStorage.delete(String(key));
    },
  },
});

const emergencySessionModule = await import(
  "../apps/license-admin/src/app/admin-panel/browser-emergency-session.ts"
);
const emergencyAuthModule = await import(
  "../apps/license-admin/src/app/admin-panel/browser-emergency-auth.ts"
);

const emergencyIdentity = {
  id: "emergency-browser-smoke",
  email: "emergency-browser@example.test",
  displayName: "Emergency Browser Smoke",
  role: "admin",
  source: "emergency",
};
const emergencyToken = "E".repeat(64);
const emergencyExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();

assert.equal(
  emergencySessionModule.persistBrowserEmergencySession({
    sessionToken: emergencyToken,
    identity: emergencyIdentity,
    expiresAt: emergencyExpiry,
  }),
  true,
);
assert.equal(
  emergencySessionModule.readBrowserEmergencySession()?.sessionToken,
  emergencyToken,
);
assert.equal(
  emergencySessionModule.persistBrowserEmergencySession({
    sessionToken: emergencyToken,
    identity: { ...emergencyIdentity, source: "supabase" },
    expiresAt: emergencyExpiry,
  }),
  false,
  "Emergency browser storage must reject non-emergency identities",
);

let observedLogout = null;
globalThis.fetch = async (input, init = {}) => {
  observedLogout = {
    url: String(input),
    authorization: new Headers(init.headers).get("authorization"),
    method: init.method || "GET",
  };
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
await emergencySessionModule.signOutBrowserEmergencySession("https://edge.example.test");
assert.deepEqual(observedLogout, {
  url: "https://edge.example.test/api/admin/emergency/logout",
  authorization: `Bearer ${emergencyToken}`,
  method: "POST",
});
assert.equal(emergencySessionModule.readBrowserEmergencySession(), null);

let observedLogin = null;
globalThis.fetch = async (input, init = {}) => {
  observedLogin = {
    url: String(input),
    body: JSON.parse(String(init.body || "{}")),
    method: init.method || "GET",
  };
  return new Response(
    JSON.stringify({
      ok: true,
      sessionToken: emergencyToken,
      identity: emergencyIdentity,
      expiresAt: emergencyExpiry,
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  );
};
const emergencyLogin = await emergencyAuthModule.beginBrowserEmergencyLogin("browser-smoke-credential");
assert.equal(emergencyLogin.ok, true);
assert.deepEqual(observedLogin, {
  url: "https://minarva-biz-license-edge.minarva-biz.workers.dev/api/admin/emergency/login",
  body: { credential: "browser-smoke-credential" },
  method: "POST",
});
if (emergencyLogin.ok) {
  assert.equal(emergencyLogin.identity.source, "emergency");
  assert.equal(emergencyLogin.sessionToken, emergencyToken);
}

globalThis.fetch = async () =>
  new Response(
    JSON.stringify({
      ok: true,
      sessionToken: "short",
      identity: emergencyIdentity,
      expiresAt: emergencyExpiry,
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  );
const malformedEmergencyLogin =
  await emergencyAuthModule.beginBrowserEmergencyLogin("browser-smoke-credential");
assert.equal(malformedEmergencyLogin.ok, false);

console.log("License-admin auth/CRUD/error/import-export smoke PASS");
