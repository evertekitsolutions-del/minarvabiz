import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url), ts = require("typescript");
require.extensions[".ts"] = (mod, path) => mod._compile(
  ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, path,
);
const { createDurableCustomerCollection } = require("../durable-customer-collection.ts");

test("laundry collection never reports payment success before native SQLite acknowledgement", async () => {
  let release;
  let created = 0;
  const flow = createDurableCustomerCollection(
    () => ({ payment: { id: "receipt-" + (++created) }, errors: [] }),
    () => new Promise(resolve => { release = resolve; }),
  );
  const input = { customerId: "c", amount: 30, method: "upi", target: { sourceType: "laundry", id: "ticket-1" } };
  const pending = flow.collect(input);
  assert(flow.hasPending());
  const duplicate = await flow.collect(input);
  assert.equal(duplicate.ok, false);
  assert.match(duplicate.error, /earlier customer payment/i);
  assert.equal(created, 1);
  release(true);
  assert.deepEqual(await pending, { ok: true, paymentId: "receipt-1" });
  assert(!flow.hasPending());
});

test("SQLite refusal leaves exactly one pending receipt and retry does not collect another", async () => {
  let creates = 0, saves = 0;
  const flow = createDurableCustomerCollection(
    () => ({ payment: { id: "p" + (++creates) }, errors: [] }),
    async () => ++saves > 1,
  );
  const input = { customerId: "c", amount: 40, method: "cash", target: { sourceType: "laundry", id: "ticket-2" } };
  const first = await flow.collect(input);
  assert.equal(first.ok, false);
  assert(flow.hasPending());
  const second = await flow.collect({ ...input, amount: 20 });
  assert.equal(second.ok, false);
  assert.equal(creates, 1);
  const acknowledged = await flow.retryPending();
  assert.deepEqual(acknowledged, { ok: true, paymentId: "p1" });
  assert.equal(creates, 1);
  assert.equal(saves, 2);
});

test("Windows LaundryList uses await, prevents double submits and only advertises saved receipts", () => {
  const app = fs.readFileSync("apps/desktop/src/App.tsx", "utf8");
  const wrapper = fs.readFileSync("apps/desktop/src/components/DesktopLaundryList.tsx", "utf8");
  const ui = fs.readFileSync("packages/ui/src/components/laundry/LaundryList.tsx", "utf8");
  assert(app.includes("DesktopLaundryList collection={customerCollection}"));
  assert(!app.includes("function handleLaundryCollection("));
  assert(wrapper.includes("await collection.collect("));
  assert(wrapper.includes("await collection.retryPending()"));
  assert(wrapper.includes("onPaymentSaved();"));
  assert(ui.includes("await onCollectPayment(ticket, amount, collectMethod)"));
  assert(ui.includes("collectInFlight.current"));
  assert(ui.includes("collectBusy ||"));
  assert(ui.includes("Receipt saved against "));
  assert(!ui.includes("Receipt posted against "));
});
