import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const uiRequire = createRequire(new URL("../../../ui/package.json", import.meta.url));
const ts = require("typescript");
for (const ext of [".ts", ".tsx"]) {
  require.extensions[ext] = (mod, filename) => mod._compile(
    ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      fileName: filename,
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022, esModuleInterop: true,
      },
    }).outputText, filename,
  );
}
const React = uiRequire("react");
const { renderToStaticMarkup } = uiRequire("react-dom/server");
const { RecurringInvoiceWorkspace } = require("../../../ui/src/components/sales/RecurringInvoiceWorkspace.tsx");
const noopAdapter = {
  async refresh() { return { schedules: [], pending: [] }; },
  async create() {},
  async setStatus() {},
  async stageDue() {},
  async preview() {},
};
const issued = {
  id: "sale-1", invoiceNumber: "INV-100", customerId: "customer-1",
  customerName: "Example", status: "completed", deletedAt: null,
  items: [{ productId: "p1", quantity: 1 }],
};
function render(props = {}) {
  return renderToStaticMarkup(React.createElement(RecurringInvoiceWorkspace, {
    enabled: true, businessDate: "2026-10-21", sourceSales: [issued],
    adapter: noopAdapter, ...props,
  }));
}

test("Web/Desktop workspace remains completely absent without host feature activation", () => {
  assert.equal(render({ enabled: false }), "");
});

test("enabled host renders a usable schedule draft form with frequencies and source", () => {
  const markup = render();
  assert.match(markup, /Recurring invoices/);
  assert.match(markup, /INV-100/);
  assert.match(markup, /Daily/);
  assert.match(markup, /Weekly/);
  assert.match(markup, /Monthly/);
  assert.match(markup, /Yearly/);
  assert.match(markup, /2026-10-21/);
  assert.match(markup, /pending/i);
  assert.doesNotMatch(markup, /Approve and create invoice/,
    "UI must not show final posting before verified per-draft review");
});

test("draft source selector excludes unpaid draft, walk-in, deleted and measured sales", () => {
  const markup = render({ sourceSales: [
    issued,
    { ...issued, id: "s2", invoiceNumber: "INV-DRAFT", status: "draft" },
    { ...issued, id: "s3", invoiceNumber: "INV-WALKIN", customerId: null },
    { ...issued, id: "s4", invoiceNumber: "INV-DELETED", deletedAt: "2026-01-01" },
    { ...issued, id: "s5", invoiceNumber: "INV-MEASURED",
      items: [{ productId: "p1", dimensionMetadata: { schemaVersion: 1 } }] },
  ] });
  assert.match(markup, /INV-100/);
  for (const name of ["INV-DRAFT", "INV-WALKIN", "INV-DELETED", "INV-MEASURED"]) {
    assert.doesNotMatch(markup, new RegExp(name));
  }
});
