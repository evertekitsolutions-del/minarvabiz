import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, filename) => mod._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename, compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    },
  }).outputText, filename,
);
const cloud = require("../remote-write.ts");
const outbox = require("../outbox-bridge.ts");
const SCOPE_A = "org-A:user-A";
const SCOPE_B = "org-B:user-B";

function reset(scope = SCOPE_A, writer = null, writerScope = SCOPE_A) {
  cloud.registerRemoteWriter(null);
  outbox.hydrateOutbox([]);
  outbox.setOutboxScope(scope);
  if (writer) cloud.registerRemoteWriter(writer, writerScope);
}
function suspendedPromise() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, release: resolve };
}

test("direct online master write refuses a writer authenticated for a different owner", async () => {
  let calls = 0;
  reset(SCOPE_B, { upsertCategory: async () => { calls++; } }, SCOPE_A);
  await cloud.remoteUpsertCategory({ id: "cat-cross-tenant", name: "Private B" });
  assert.equal(calls, 0);
  const [event] = outbox.exportOutbox();
  assert.equal(event.ownerScope, SCOPE_B);
  assert.equal(event.status, "pending");
});

test("direct finance write never acknowledges or transmits an event across owner scopes", async () => {
  let calls = 0;
  reset(SCOPE_B, { createSale: async () => { calls++; } }, SCOPE_A);
  await cloud.remoteCreateSale({ id: "sale-B" }, [{ id: "payment-B" }]);
  assert.equal(calls, 0);
  const events = outbox.exportOutbox();
  assert.equal(events.length, 2);
  assert.ok(events.every(e => e.ownerScope === SCOPE_B && e.status === "pending"));
});

test("direct writer cannot acknowledge an unscoped legacy event", async () => {
  let calls = 0;
  reset(null, { upsertCategory: async () => { calls++; } }, SCOPE_A);
  await cloud.remoteUpsertCategory({ id: "cat-legacy", name: "Older unscoped" });
  assert.equal(calls, 0);
  assert.equal(outbox.exportOutbox()[0].ownerScope, undefined);
  assert.equal(outbox.exportOutbox()[0].status, "pending");
});

test("changing owner during in-flight successful cloud write leaves source event unacknowledged", async () => {
  const gate = suspendedPromise();
  let calls = 0;
  reset(SCOPE_A, { upsertCategory: async () => { calls++; await gate.promise; } }, SCOPE_A);
  const request = cloud.remoteUpsertCategory({ id: "cat-switch", name: "From A" });
  assert.equal(calls, 1);
  outbox.setOutboxScope(SCOPE_B);
  gate.release();
  await request;
  const [event] = outbox.exportOutbox();
  assert.equal(event.ownerScope, SCOPE_A);
  assert.equal(event.status, "pending");
});

test("verified same-owner write still gets exactly one acknowledgement", async () => {
  let calls = 0;
  reset(SCOPE_A, { upsertCategory: async () => { calls++; } }, SCOPE_A);
  await cloud.remoteUpsertCategory({ id: "cat-authorized", name: "From A" });
  assert.equal(calls, 1);
  const [event] = outbox.exportOutbox();
  assert.equal(event.ownerScope, SCOPE_A);
  assert.equal(event.status, "synced");
});

test("replacing the writer during upload still denies stale acknowledgement", async () => {
  const gate = suspendedPromise();
  reset(SCOPE_A, { upsertCategory: async () => { await gate.promise; } }, SCOPE_A);
  const request = cloud.remoteUpsertCategory({ id: "cat-revoked" });
  cloud.registerRemoteWriter(null);
  gate.release();
  await request;
  assert.equal(outbox.exportOutbox()[0].status, "pending");
});

test("legacy direct expense, supplier and purchase writers refuse cross-owner data", async () => {
  const calls = [];
  reset(SCOPE_B, {
    createExpense: async () => calls.push("expense"),
    createSupplier: async () => calls.push("supplier"),
    createPurchase: async () => calls.push("purchase"),
  }, SCOPE_A);
  await cloud.remoteCreateExpense({ id: "expense-B" });
  await cloud.remoteCreateSupplier({ id: "supplier-B" });
  await cloud.remoteCreatePurchase({ id: "purchase-B" });
  assert.deepEqual(calls, []);
  assert.ok(outbox.exportOutbox().every(e => e.ownerScope === SCOPE_B && e.status === "pending"));
});

test("queued customer settlement does not start after the verified session switches", async () => {
  let calls = 0;
  reset(SCOPE_A, { recordCustomerPayment: async () => { calls++; } }, SCOPE_A);
  outbox.setOutboxScope(SCOPE_B);
  await cloud.remoteCollectCustomerPayment({ id: "payment-B" }, { id: "customer-B" }, []);
  assert.equal(calls, 0);
  assert.ok(outbox.exportOutbox().every(e => e.ownerScope === SCOPE_B && e.status === "pending"));
});
