import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename,
);
const {
  validateWebhookEndpoint, validateWebhookEvents, upsertWebhookSubscription,
  listWebhookSubscriptionsForScope, shouldDispatchWebhook,
} = require("../webhook-subscriptions.ts");
const scope = { tenantId: "tenantA", companyId: "companyA", branchId: "branch1" };
const mutation = {
  id: "sub1", endpoint: "https://hooks.example.org/events",
  events: ["invoice.paid", "invoice.created", "invoice.paid"], enabled: false,
};
const create = (overrides = {}) => upsertWebhookSubscription({
  scope, mutation, expectedRevision: 0, now: "2026-11-06T00:00:00Z", ...overrides,
});
test("subscription is opt-in, versioned and events are deduplicated", () => {
  const first = create();
  assert.equal(first.enabled, false);
  assert.equal(first.revision, 1);
  assert.deepEqual(first.events, ["invoice.created", "invoice.paid"]);
  assert.equal(shouldDispatchWebhook(first, scope, "invoice.paid"), false);
  const next = create({ current: first, expectedRevision: 1,
    mutation: { ...mutation, enabled: true } });
  assert.equal(next.revision, 2);
  assert.equal(shouldDispatchWebhook(next, scope, "invoice.paid"), true);
  assert.equal(shouldDispatchWebhook(next, scope, "stock.low"), false);
});
test("cross-tenant, cross-company and cross-branch data is inaccessible", () => {
  const first = create({ mutation: { ...mutation, enabled: true } });
  for (const foreign of [
    { ...scope, tenantId: "tenantB" }, { ...scope, companyId: "companyB" },
    { ...scope, branchId: "branch2" }, { tenantId: "tenantA", companyId: "companyA" },
  ]) {
    assert.equal(shouldDispatchWebhook(first, foreign, "invoice.paid"), false);
    assert.deepEqual(listWebhookSubscriptionsForScope([first], foreign), []);
    assert.throws(() => create({ current: first, expectedRevision: 1, scope: foreign }), /scope mismatch/);
  }
  assert.equal(listWebhookSubscriptionsForScope([first], scope).length, 1);
});
test("stale updates and malformed configuration fail closed", () => {
  const first = create();
  assert.throws(() => create({ current: first, expectedRevision: 0 }), /revision conflict/);
  assert.throws(() => create({ expectedRevision: -1 }), /revision conflict/);
  assert.throws(() => create({ mutation: { ...mutation, enabled: "true" } }), /enabled/);
  assert.throws(() => create({ mutation: { ...mutation, events: ["unapproved.event"] } }), /events/);
  assert.throws(() => create({ now: "not-a-date" }), /timestamp/);
  assert.deepEqual(validateWebhookEvents(["invoice.paid", "invoice.paid"]), ["invoice.paid"]);
});
test("rejects non-HTTPS, credentials, fragments and literal/private destinations", () => {
  for (const endpoint of [
    "http://hooks.example.org", "https://user:password@hooks.example.org",
    "https://hooks.example.org/#secret", "https://localhost", "https://127.0.0.1",
    "https://192.168.1.3", "https://8.8.8.8", "https://[::1]",
    "https://printer.local", "https://service.internal", "https://no-dot",
    "https://private.onion", "https://router.home.arpa", "https://1.0.0.127.in-addr.arpa",
    "https://-bad.example.org", "invalid", "",
  ]) assert.throws(() => validateWebhookEndpoint(endpoint), undefined, endpoint);
  assert.equal(validateWebhookEndpoint("https://hooks.example.org/events"), "https://hooks.example.org/events");
});

test("rejects DNS labels and hostnames exceeding DNS wire limits", () => {
  const longLabel = "a".repeat(64);
  const longHost = ["a".repeat(63), "b".repeat(63), "c".repeat(63), "d".repeat(62)].join(".");
  assert.equal(longHost.length, 254);
  for (const host of [`${longLabel}.example.org`, longHost]) {
    assert.throws(() => validateWebhookEndpoint(`https://${host}/hook`), /hostname/);
  }
  assert.equal(validateWebhookEndpoint(`https://${"a".repeat(63)}.example.org/hook`),
    `https://${"a".repeat(63)}.example.org/hook`);
});
