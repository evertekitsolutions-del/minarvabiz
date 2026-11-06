import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

// Coverage Ratchet executes *.test.mjs; the TS-only companion is typechecked,
// but is not discovered by that runner. Exercise the actual source module here.
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, file) => mod._compile(
  ts.transpileModule(fs.readFileSync(file, "utf8"), {
    fileName: file,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText,
  file,
);
const { validatePrintLayout, decidePrintLayoutMutation, resolvePrintLayout } =
  require("../print-layout-policy.ts");

const base = {
  id: "invoice-default", tenantId: "tenant-1", companyId: "company-1",
  branchId: null, document: "invoice", paper: "thermal-80", title: "Tax Invoice",
  fields: ["document_number", "items", "total"], footer: "Thank you",
  revision: 1, enabled: true,
};
const scope = { tenantId: "tenant-1", companyId: "company-1", branchId: null };
const mutate = (value, expectedRevision = null, operationId = "op-1") =>
  ({ value, expectedRevision, operationId });

test("create, replay, update and reject stale or skipped revisions", () => {
  assert.equal(decidePrintLayoutMutation(scope, mutate(base), null, null).status, "create");
  assert.equal(decidePrintLayoutMutation(scope, mutate(base), base, "op-1").status, "replay");
  assert.equal(decidePrintLayoutMutation(scope,
    mutate({ ...base, revision: 2 }, 1, "op-2"), base, "op-1").status, "update");
  assert.equal(decidePrintLayoutMutation(scope,
    mutate({ ...base, revision: 3 }, 1, "op-3"),
    { ...base, revision: 2 }, "op-2").status, "conflict");
  assert.equal(decidePrintLayoutMutation(scope,
    mutate({ ...base, revision: 3 }, 1, "op-3"), base, "op-2").status, "conflict");
  assert.equal(decidePrintLayoutMutation(scope,
    mutate({ ...base, id: "other", revision: 2 }, 1, "op-2"), base, "op-1").status, "conflict");
});

test("scope isolation prevents tenant, company and branch mutation", () => {
  for (const patch of [
    { tenantId: "tenant-2" }, { companyId: "company-2" }, { branchId: "branch-2" },
  ]) {
    assert.equal(decidePrintLayoutMutation(scope, mutate({ ...base, ...patch }),
      null, null).status, "denied");
    assert.equal(decidePrintLayoutMutation(scope, mutate(base, 1, "op-2"),
      { ...base, ...patch }, "op-1").status, "denied");
  }
  assert.throws(() => decidePrintLayoutMutation({ ...scope, tenantId: "" },
    mutate(base), null, null));
  assert.throws(() => decidePrintLayoutMutation(scope,
    mutate(base, null, "bad operation"), null, null));
});

test("branch preference and company fallback never cross tenant or document", () => {
  const branch = { ...base, id: "branch-layout", branchId: "b1" };
  const other = { ...base, id: "other", tenantId: "other-tenant" };
  const candidates = [other, base, branch];
  assert.equal(resolvePrintLayout({ ...scope, branchId: "b1" }, "invoice", candidates).id, "branch-layout");
  assert.equal(resolvePrintLayout({ ...scope, branchId: "b2" }, "invoice", candidates).id, base.id);
  assert.equal(resolvePrintLayout({ ...scope, tenantId: "unknown" }, "invoice", candidates), null);
  assert.equal(resolvePrintLayout(scope, "quotation", candidates), null);
  assert.equal(resolvePrintLayout(scope, "invoice", [{ ...base, enabled: false }]), null);
  assert.throws(() => resolvePrintLayout(scope, "unknown", candidates));
});

test("validate required fields, documents, paper, identity and printable text", () => {
  const invalid = [
    { id: "" }, { tenantId: "bad tenant" }, { companyId: "" }, { branchId: "bad branch" },
    { document: "unknown" }, { paper: "unknown" }, { revision: 0 },
    { revision: 1.5 }, { enabled: "true" }, { title: "<script>" },
    { title: "" }, { title: "x".repeat(101) }, { footer: "<img>" },
    { title: "Invoice\u202e123" }, { footer: "Total\u2067USD" },
    { title: "Bad\ud800" }, { footer: "Bad\udc00" },
    { footer: "x".repeat(501) }, { fields: ["items", "total"] },
    { fields: ["items", "total", "document_number", "total"] },
    { fields: ["document_number", "items", "total", "unknown"] },
    { fields: "document_number,items,total" },
    { fields: [...base.fields, ...Array(12).fill("tax")] },
    { paper: "thermal-58", fields: [...base.fields, "footer"], footer: "x".repeat(121) },
  ];
  for (const patch of invalid) {
    assert.throws(() => validatePrintLayout({ ...base, ...patch }),
      undefined, JSON.stringify(patch).slice(0, 100));
  }
  assert.equal(validatePrintLayout({ ...base, paper: "a4", footer: "x".repeat(121) }).paper, "a4");
  const copy = validatePrintLayout(base);
  assert.notEqual(copy.fields, base.fields);
  assert.deepEqual(copy.fields, base.fields);
});

test("replayed operation IDs cannot acknowledge modified print content", () => {
  assert.equal(decidePrintLayoutMutation(scope,
    mutate({ ...base, title: "Changed Invoice" }), base, "op-1").status, "conflict");
  assert.equal(decidePrintLayoutMutation(scope,
    mutate({ ...base, fields: [...base.fields, "tax"] }), base, "op-1").status, "conflict");
  assert.equal(decidePrintLayoutMutation(scope,
    mutate({ ...base, revision: 2 }), base, "op-1").status, "conflict");
  assert.throws(() => decidePrintLayoutMutation(scope,
    mutate({ ...base, title: "Bad" + String.fromCharCode(0x202e) }), base, "op-1"));
  assert.equal(decidePrintLayoutMutation(scope,
    mutate({ ...base, fields: [...base.fields] }), base, "op-1").status, "replay");
});
