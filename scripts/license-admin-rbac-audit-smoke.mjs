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

const session = await readFile(new URL("../apps/license-admin/src/lib/admin-session.ts", import.meta.url), "utf8");
assert.match(session, /role: AdminRole/);
assert.match(session, /role: "admin"/);
assert.match(session, /isAdminRole/);

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
assert.match(panel, /role: "viewer" \| "operator" \| "admin"/);
assert.match(panel, /canIssue/);
assert.match(panel, /canManageStatus/);

const migration = await readFile(new URL("../supabase/migrations/20260924_license_admin_rbac_audit.sql", import.meta.url), "utf8");
assert.match(migration, /DEFAULT 'viewer'/);
assert.match(migration, /CHECK \(role IN \('viewer','operator','admin'\)\)/);
assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.license_admin_audit_log/);
assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
assert.match(migration, /REVOKE ALL ON TABLE public\.license_admin_audit_log[\s\S]*service_role/);
assert.match(migration, /GRANT SELECT, INSERT ON TABLE public\.license_admin_audit_log[\s\S]*TO service_role/);

console.log("License-admin RBAC/audit security smoke PASS");
