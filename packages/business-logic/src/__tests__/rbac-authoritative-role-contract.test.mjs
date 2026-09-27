import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const migration = read("supabase/migrations/20260927_authoritative_org_rbac.sql");
const dataSource = read("apps/web/src/lib/data-source.ts");
const login = read("apps/web/src/app/login/page.tsx");
const layout = read("apps/web/src/components/AppLayoutClient.tsx");
const users = read("packages/business-logic/src/users.ts");
const localAuth = read("packages/database/src/auth.ts");
const usersPage = read("apps/web/src/app/(app)/users/page.tsx");

for (const token of [
  "REVOKE INSERT, UPDATE, DELETE ON TABLE public.organization_members",
  "CREATE OR REPLACE FUNCTION public.current_user_authorization",
  "SECURITY INVOKER",
  "Exactly one Minarva Biz organization membership is required",
  "CREATE OR REPLACE FUNCTION public.set_organization_member_role",
  "Users cannot change their own organization role",
  "Only a super admin may grant or modify the super admin role",
]) assert.equal(migration.includes(token), true, `Missing authoritative RBAC migration contract: ${token}`);

assert.match(dataSource, /resolveOnlineAuthorization/);
assert.match(dataSource, /current_user_authorization/);
assert.match(dataSource, /AUTHORIZED_ROLES/);
assert.match(dataSource, /authorization\.role/);
assert.match(dataSource, /authorization\.orgId/);

assert.doesNotMatch(login, /role:\s*"admin"/);
assert.match(login, /role:\s*remote\.role/);
assert.match(login, /fullName:\s*remote\.fullName/);

assert.match(layout, /if \(isSupabaseConfigured\(\)\) setCurrentRole\(null\)/);
assert.match(layout, /resolveOnlineAuthorization\(session\.token, session\.user\.id\)/);
assert.match(layout, /setSession\(session\.token, authoritativeUser\)/);

for (const fn of ["listAppUsers", "createAppUser", "setUserActive", "setUserRole"]) {
  const start = users.indexOf(`export function ${fn}`);
  assert.ok(start >= 0, `${fn} must exist`);
  const block = users.slice(start, start + 900);
  assert.match(block, /assertPermission\("users\.manage"\)/, `${fn} must enforce users.manage`);
}
assert.match(users, /Only a super admin may grant or modify the super admin role/);
assert.match(usersPage, /can\("users\.manage"\)/);

assert.match(localAuth, /Direct local registration is disabled after initial setup/);
assert.match(localAuth, /The first local user must be an administrator/);
assert.match(localAuth, /role:\s*"admin"/);

console.log("Authoritative RBAC role contract PASS");
