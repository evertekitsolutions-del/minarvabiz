import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear(),
  key: (index) => [...storage.keys()][index] ?? null,
  get length() { return storage.size; },
};

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(
  fs.readFileSync(filename, "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }
).outputText, filename);

const auth = require("../auth.ts");

assert.equal(auth.hasLocalUsers(), false);

const invalidRole = await auth.registerUser({
  email: "owner@example.test",
  fullName: "Owner",
  password: "SecurePass123!",
  role: "super_admin",
});
assert.equal(invalidRole.user, null);
assert.match(invalidRole.error ?? "", /first local user must be an administrator/i);

const shortPassword = await auth.registerUser({
  email: "owner@example.test",
  fullName: "Owner",
  password: "short",
  role: "admin",
});
assert.equal(shortPassword.user, null);
assert.match(shortPassword.error ?? "", /at least 8 characters/i);

const first = await auth.registerUser({
  email: "OWNER@EXAMPLE.TEST",
  fullName: "Owner",
  password: "SecurePass123!",
});
assert.ok(first.user);
assert.equal(first.user.role, "admin");
assert.equal(first.user.email, "owner@example.test");
assert.equal(auth.hasLocalUsers(), true);

const second = await auth.registerUser({
  email: "second@example.test",
  fullName: "Second",
  password: "SecurePass123!",
  role: "admin",
});
assert.equal(second.user, null);
assert.match(second.error ?? "", /Direct local registration is disabled after initial setup/);

const login = await auth.login("owner@example.test", "SecurePass123!");
assert.ok(login.session);
assert.equal(login.user?.role, "admin");
assert.equal(auth.validateSession(login.session.token)?.id, first.user.id);

auth.logout(login.session.token);
assert.equal(auth.validateSession(login.session.token), null);

console.log("Local auth first-admin RBAC behavior PASS");
