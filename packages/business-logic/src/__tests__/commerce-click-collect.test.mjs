import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, filename) => mod._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename
);
const { transitionClickCollect } = require("../commerce-click-collect.ts");
const scope = { tenantId: "t1", companyId: "c1", branchId: "b1" };
const order = (patch = {}) => ({
  ...scope, id: "order1", customerId: "customer1", status: "awaiting_payment",
  revision: 0, lastEventId: null, paymentVerified: true, pickupEnabled: true, ...patch,
});
const go = (patch = {}) => transitionClickCollect({
  order: order(), scope, eventId: "evt1", expectedRevision: 0,
  action: "payment_confirmed", actorRole: "merchant_staff", ...patch,
});
test("payment -> preparing -> ready -> collected with verified handover", () => {
  const p = go();
  assert.equal(p.order.status, "preparing");
  const ready = go({ order: p.order, eventId: "evt2", expectedRevision: 1, action: "mark_ready" });
  const collected = go({ order: ready.order, eventId: "evt3", expectedRevision: 2,
    action: "handover", pickupProofVerified: true });
  assert.equal(collected.order.status, "collected");
  assert.equal(collected.order.revision, 3);
  assert.equal(collected.event.from, "ready");
  assert.equal(order().status, "awaiting_payment");
});
test("scope and opt-in are mandatory", () => {
  assert.throws(() => go({ scope: { ...scope, tenantId: "other" } }), /scope mismatch/);
  assert.throws(() => go({ scope: { ...scope, companyId: "other" } }), /scope mismatch/);
  assert.throws(() => go({ scope: { ...scope, branchId: "other" } }), /scope mismatch/);
  assert.throws(() => go({ order: order({ pickupEnabled: false }) }), /disabled/);
});
test("payment and proof cannot be bypassed", () => {
  assert.throws(() => go({ order: order({ paymentVerified: false }) }), /Payment/);
  assert.throws(() => go({ order: order({ status: "ready" }), action: "handover" }), /proof/);
  assert.throws(() => go({ order: order({ status: "ready", paymentVerified: false }),
    action: "handover", pickupProofVerified: true }), /payment/);
});
test("duplicate immediate event is idempotent; stale or forged revisions fail closed", () => {
  const p = go();
  assert.equal(go({ order: p.order, eventId: "evt1", expectedRevision: 0 }).applied, false);
  assert.throws(() => go({ order: p.order, eventId: "evt2", expectedRevision: 0 }), /Stale/);
  assert.throws(() => go({ order: p.order, eventId: "evt1", expectedRevision: 1 }), /replay/);
  assert.throws(() => go({ order: order({ revision: Number.MAX_SAFE_INTEGER }), expectedRevision: Number.MAX_SAFE_INTEGER }), /revision/);
});
test("customer can cancel own order, never mark ready or hand over", () => {
  const cancel = go({ actorRole: "customer", actorCustomerId: "customer1", action: "cancel" });
  assert.equal(cancel.order.status, "cancelled");
  assert.throws(() => go({ actorRole: "customer", actorCustomerId: "other", action: "cancel" }), /Customer/);
  assert.throws(() => go({ actorRole: "customer", actorCustomerId: "customer1", action: "payment_confirmed" }), /Customer/);
  assert.throws(() => go({ order: cancel.order, eventId: "evt2", expectedRevision: 1, action: "mark_ready" }), /Invalid/);
});
test("invalid IDs, statuses and revision inputs reject", () => {
  assert.throws(() => go({ eventId: " evt1" }), /canonical/);
  assert.throws(() => go({ order: order({ status: "__proto__" }) }), /Unknown/);
  assert.throws(() => go({ order: order({ revision: -1 }) }), /revision/);
  assert.throws(() => go({ actorRole: "anonymous" }), /Unauthorized/);
});
