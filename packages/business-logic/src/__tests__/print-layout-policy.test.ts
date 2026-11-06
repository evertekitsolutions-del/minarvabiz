import assert from "node:assert/strict";
import test from "node:test";
import {
  decidePrintLayoutMutation, resolvePrintLayout, validatePrintLayout,
  type PrintLayoutConfig,
} from "../print-layout-policy.ts";

const base: PrintLayoutConfig = {
  id: "invoice-default", tenantId: "tenant-1", companyId: "company-1",
  branchId: null, document: "invoice", paper: "thermal-80", title: "Tax Invoice",
  fields: ["document_number", "items", "total"], footer: "Thank you",
  revision: 1, enabled: true,
};
const scope = { tenantId: "tenant-1", companyId: "company-1", branchId: null };

test("create, replay, optimistic update and stale conflict", () => {
  const created = decidePrintLayoutMutation(scope, {
    operationId: "op-1", expectedRevision: null, value: base,
  }, null, null);
  assert.equal(created.status, "create");
  const replay = decidePrintLayoutMutation(scope, {
    operationId: "op-1", expectedRevision: null, value: base,
  }, base, "op-1");
  assert.equal(replay.status, "replay");
  const updated = decidePrintLayoutMutation(scope, {
    operationId: "op-2", expectedRevision: 1, value: { ...base, revision: 2 },
  }, base, "op-1");
  assert.equal(updated.status, "update");
  const stale = decidePrintLayoutMutation(scope, {
    operationId: "op-3", expectedRevision: 1, value: { ...base, revision: 3 },
  }, { ...base, revision: 2 }, "op-2");
  assert.equal(stale.status, "conflict");
});
test("scope isolation denies cross-tenant/company/branch writes", () => {
  for (const patch of [{ tenantId: "tenant-2" }, { companyId: "company-2" },
    { branchId: "branch-2" }]) {
    assert.equal(decidePrintLayoutMutation(scope, {
      operationId: "op-1", expectedRevision: null, value: { ...base, ...patch },
    }, null, null).status, "denied");
  }
});
test("branch override and company fallback never leak across tenants", () => {
  const branch = { ...base, id: "branch-layout", branchId: "b1" };
  const other = { ...base, id: "other", tenantId: "other-tenant" };
  const candidates = [other, base, branch];
  assert.equal(resolvePrintLayout({ ...scope, branchId: "b1" }, "invoice", candidates)?.id, "branch-layout");
  assert.equal(resolvePrintLayout({ ...scope, branchId: "b2" }, "invoice", candidates)?.id, "invoice-default");
  assert.equal(resolvePrintLayout({ ...scope, tenantId: "unknown" }, "invoice", candidates), null);
  assert.equal(resolvePrintLayout(scope, "quotation", candidates), null);
});
test("reject unsafe and incomplete layouts", () => {
  assert.throws(() => validatePrintLayout({ ...base, title: "<script>" }));
  assert.throws(() => validatePrintLayout({ ...base, footer: "<img>" }));
  assert.throws(() => validatePrintLayout({ ...base, fields: ["items", "total"] }));
  assert.throws(() => validatePrintLayout({ ...base, fields: ["items", "total", "document_number", "total"] }));
  assert.throws(() => validatePrintLayout({ ...base, paper: "thermal-58", footer: "a".repeat(121) }));
  assert.throws(() => validatePrintLayout({ ...base, revision: 0 }));
});
test("returned configuration is detached from caller's field array", () => {
  const fields = ["document_number", "items", "total"] as PrintLayoutConfig["fields"];
  const result = validatePrintLayout({ ...base, fields });
  assert.notEqual(result.fields, fields);
});
