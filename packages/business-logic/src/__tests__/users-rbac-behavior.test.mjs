import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(
  fs.readFileSync(filename, "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }
).outputText, filename);

const permissions = require("../permissions.ts");
const users = require("../users.ts");

permissions.setCurrentRole("cashier");
assert.throws(() => users.listAppUsers(), /Permission denied: users\.manage/);

permissions.setCurrentRole("admin");
users.hydrateUsers({ users: [
  { id: "root-user", email: "root@example.test", fullName: "Root", role: "super_admin", isActive: true, createdAt: "2026-09-27T00:00:00.000Z" },
  { id: "staff-user", email: "staff@example.test", fullName: "Staff", role: "staff", isActive: true, createdAt: "2026-09-27T00:00:00.000Z" },
] });

assert.equal(users.listAppUsers().length, 2);
assert.throws(
  () => users.createAppUser({ email: "root2@example.test", fullName: "Root 2", role: "super_admin" }),
  /Only a super admin/
);
const manager = users.createAppUser({ email: "manager@example.test", fullName: "Manager", role: "manager" });
assert.equal(manager.role, "manager");

assert.throws(() => users.setUserRole("staff-user", "super_admin"), /Only a super admin/);
assert.equal(users.setUserRole("staff-user", "cashier")?.role, "cashier");
assert.throws(() => users.setUserActive("root-user", false), /Only a super admin/);
assert.equal(users.setUserActive("staff-user", false)?.isActive, false);

permissions.setCurrentRole("super_admin");
assert.equal(users.setUserRole("staff-user", "super_admin")?.role, "super_admin");
assert.equal(users.setUserActive("staff-user", true)?.isActive, true);

permissions.setCurrentRole(null);
console.log("Local user RBAC behavior PASS");
