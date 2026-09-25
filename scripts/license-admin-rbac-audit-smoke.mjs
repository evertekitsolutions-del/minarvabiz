import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { adminRoleAllows, isAdminRole } from "../apps/license-admin/src/lib/admin-rbac.ts";

assert.equal(isAdminRole("viewer"), true);
assert.equal(isAdminRole("operator"), true);
assert.equal(isAdminRole("admin"), true);
assert.equal(isAdminRole("super_admin"), false);

assert.equal(adminRoleAllows("viewer", "license.read"), true);
assert.equal(adminRoleAllows("viewer", "license.issue"), false);
assert.equal(adminRoleAllows("operator", "license.issue"), true);
assert.equal(adminRoleAllows("operator", "license.offline_activate"), true);
assert.equal(adminRoleAllows("operator", "license.status_manage"), false);
assert.equal(adminRoleAllows("admin", "license.status_manage"), true);
assert.equal(adminRoleAllows("viewer", "customer.provision"), false);
assert.equal(adminRoleAllows("operator", "customer.provision"), true);
assert.equal(adminRoleAllows("admin", "customer.provision"), true);

const session = await readFile(new URL("../apps/license-admin/src/lib/admin-session.ts", import.meta.url), "utf8");
assert.match(session, /role: AdminRole/);
assert.match(session, /role: "admin"/);
assert.match(session, /isAdminIdentityRole/);
assert.doesNotMatch(session, /from \"\.\/admin-rbac\"/);

const namedAdmin = await readFile(new URL("../apps/license-admin/src/lib/named-admin.ts", import.meta.url), "utf8");
assert.match(namedAdmin, /display_name%2Cstatus%2Crole/);
assert.match(namedAdmin, /isAdminRole\(row\.role\)/);

const store = await readFile(new URL("../apps/license-admin/src/lib/admin-session-store.ts", import.meta.url), "utf8");
assert.match(store, /actor_role/);
assert.match(store, /row\.actor_role !== claims\.identity\.role/);
assert.match(store, /identity\.role !== claims\.identity\.role/);

const actions = await readFile(new URL("../apps/license-admin/src/app/actions.ts", import.meta.url), "utf8");
assert.match(actions, /adminRoleAllows/);
assert.match(actions, /recordAdminAudit/);
assert.match(actions, /"license\.issue"/);
assert.match(actions, /"license\.offline_activate"/);
assert.match(actions, /"license\.status_manage"/);
assert.doesNotMatch(actions, /actor: "license-admin"/);
assert.doesNotMatch(actions, /actor: "license-admin-offline"/);
assert.match(actions, /actor: session\.identity\.email/);

const audit = await readFile(new URL("../apps/license-admin/src/lib/admin-audit.ts", import.meta.url), "utf8");
assert.match(audit, /license_admin_audit_log/);
assert.match(audit, /actor_role: claims\.identity\.role/);
assert.match(audit, /session_id: claims\.sessionId/);

const panel = await readFile(new URL("../apps/license-admin/src/app/AdminPanel.tsx", import.meta.url), "utf8");
const panelTypes = await readFile(new URL("../apps/license-admin/src/app/admin-panel/types.ts", import.meta.url), "utf8");
const panelModel = await readFile(new URL("../apps/license-admin/src/app/admin-panel/model.ts", import.meta.url), "utf8");
assert.match(panelTypes, /type AdminRole = "viewer" \| "operator" \| "admin"/);
assert.match(panelModel, /canIssueLicense/);
assert.match(panelModel, /canManageLicenseStatus/);
assert.match(panel, /const canIssue = canIssueLicense\(identity\.role\)/);
assert.match(panel, /const canManageStatus = canManageLicenseStatus\(identity\.role\)/);

const migration = await readFile(new URL("../supabase/migrations/20260924_license_admin_rbac_audit.sql", import.meta.url), "utf8");
assert.match(migration, /DEFAULT 'viewer'/);
assert.match(migration, /CHECK \(role IN \('viewer','operator','admin'\)\)/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.license_admin_audit_log/);
assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
assert.match(migration, /REVOKE ALL ON TABLE public\.license_admin_audit_log[\s\S]*service_role/);
assert.match(migration, /GRANT SELECT, INSERT ON TABLE public\.license_admin_audit_log[\s\S]*TO service_role/);

console.log("License-admin RBAC/audit security smoke PASS");
