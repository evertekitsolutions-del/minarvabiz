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
  }).outputText, filename,
);
const { applyMarketingConsentEvent, maySendMarketingMessage } = require("../marketing-consent-policy.ts");

const scope = { tenantId: "tenant-a", companyId: "company-a", branchId: "branch-a" };
const policy = { ...scope, marketingEnabled: true, actorCanManageConsent: true };
const event = (patch = {}) => ({
  ...scope, eventId: "e1", customerId: "customer-a", channel: "whatsapp",
  purpose: "promotional", action: "opt_in", revision: 1,
  recordedAt: "2026-11-06T00:00:00.000Z", source: "customer_portal", ...patch,
});
const send = (patch = {}) => ({
  ...scope, marketingEnabled: true, customerId: "customer-a",
  channel: "whatsapp", purpose: "promotional", ...patch,
});

test("MKT-016: no marketing without exact opt-in, matching scope and enabled merchant", () => {
  const optIn = event();
  assert.equal(maySendMarketingMessage(send(), null), false);
  assert.equal(maySendMarketingMessage(send(), optIn), true);
  for (const mismatch of [
    { tenantId: "tenant-b" }, { companyId: "company-b" },
    { branchId: "branch-b" }, { customerId: "customer-b" },
    { channel: "sms" }, { purpose: "loyalty" }, { marketingEnabled: false },
  ]) assert.equal(maySendMarketingMessage(send(mismatch), optIn), false);
  assert.equal(maySendMarketingMessage(send(), event({ action: "opt_out" })), false);
});

test("consent CAS accepts first opt-in, idempotent replay and later opt-out", () => {
  const first = event();
  assert.deepEqual(applyMarketingConsentEvent(policy, null, first), { accepted: true, current: first });
  assert.deepEqual(applyMarketingConsentEvent(policy, first, first), { accepted: true, current: first });
  const stop = event({ eventId: "e2", revision: 2, action: "opt_out", recordedAt: "2026-11-06T00:01:00.000Z" });
  assert.equal(applyMarketingConsentEvent(policy, first, stop).accepted, true);
  assert.equal(maySendMarketingMessage(send(), stop), false);
  assert.equal(applyMarketingConsentEvent(policy, stop, first).reason, "stale_revision");
  assert.equal(applyMarketingConsentEvent(policy, first, event({ eventId: "e1", action: "opt_out" })).reason, "conflicting_event");
});

test("consent changes require trusted actor; disabling marketing never blocks authorized opt-out", () => {
  const stopped = event({ action: "opt_out" });
  assert.equal(applyMarketingConsentEvent({ ...policy, marketingEnabled: false }, null, event()).reason, "permission_denied");
  assert.equal(applyMarketingConsentEvent({ ...policy, marketingEnabled: false }, null, stopped).accepted, true);
  for (const action of ["opt_in", "opt_out"]) {
    assert.equal(applyMarketingConsentEvent(
      { ...policy, actorCanManageConsent: false }, null, event({ action }),
    ).reason, "permission_denied");
    assert.equal(applyMarketingConsentEvent(
      { ...policy, marketingEnabled: false, actorCanManageConsent: false },
      null, event({ action }),
    ).reason, "permission_denied");
  }
});

test("invalid event, cross-tenant consent and non-consecutive revisions fail closed", () => {
  for (const patch of [
    { tenantId: "other" }, { companyId: "other" }, { branchId: "other" },
  ]) assert.equal(applyMarketingConsentEvent(policy, null, event(patch)).reason, "scope_mismatch");
  for (const patch of [
    { eventId: "" }, { customerId: "" }, { source: " " }, { channel: "push" },
    { purpose: "billing" }, { action: "unknown" }, { revision: 0 },
    { recordedAt: "invalid" }, { recordedAt: "2026-02-30T00:00:00.000Z" },
  ]) assert.equal(applyMarketingConsentEvent(policy, null, event(patch)).reason, "invalid_event");
  assert.equal(applyMarketingConsentEvent(policy, null, event({ revision: 3 })).reason, "stale_revision");
  assert.equal(applyMarketingConsentEvent(policy, event(), event({ eventId: "e3", revision: 3 })).reason, "stale_revision");
  assert.equal(applyMarketingConsentEvent(policy, event(), event({
    eventId: "e2", revision: 2, recordedAt: "2026-11-05T23:59:00.000Z",
  })).reason, "stale_revision");
});

test("marketing consent module is pure and does not auto-send or call a provider", () => {
  const source = fs.readFileSync(new URL("../marketing-consent-policy.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /fetch\s*\(|axios|sendMail\s*\(|enqueueOutbox\s*\(/);
});

test("malformed runtime inputs fail closed without throwing; valid fractional UTC dates are accepted", () => {
  for (const invalid of [null, undefined, {}, "not an event"]) {
    assert.equal(applyMarketingConsentEvent(policy, null, invalid).reason, "invalid_event");
    assert.equal(maySendMarketingMessage(send(), invalid), false);
  }
  assert.equal(applyMarketingConsentEvent(null, null, event()).reason, "invalid_event");
  assert.equal(maySendMarketingMessage(null, event()), false);
  for (const recordedAt of [
    "2026-11-06T00:00:00Z", "2026-11-06T00:00:00.1Z",
    "2026-11-06T00:00:00.12Z", "2026-11-06T00:00:00.123Z",
  ]) assert.equal(applyMarketingConsentEvent(policy, null, event({ recordedAt })).accepted, true);
  for (const recordedAt of ["2026-02-30T00:00:00Z", "2026-11-06T24:00:00Z"]) {
    assert.equal(applyMarketingConsentEvent(policy, null, event({ recordedAt })).reason, "invalid_event");
  }
});

test("consent authorization flags must be literal booleans, never truthy client values", () => {
  for (const actorCanManageConsent of ["true", 1, {}, null, undefined]) {
    assert.equal(applyMarketingConsentEvent(
      { ...policy, actorCanManageConsent }, null, event(),
    ).reason, "permission_denied");
    assert.equal(applyMarketingConsentEvent(
      { ...policy, actorCanManageConsent }, null, event({ action: "opt_out" }),
    ).reason, "permission_denied");
  }
  for (const marketingEnabled of ["true", 1, {}, null, undefined]) {
    assert.equal(applyMarketingConsentEvent(
      { ...policy, marketingEnabled }, null, event(),
    ).reason, "permission_denied");
    assert.equal(maySendMarketingMessage(send({ marketingEnabled }), event()), false);
  }
});

test("MKT-016 storage migration is registered and denies client consent writes", () => {
  const root = new URL("../../../../", import.meta.url);
  const migration = "20261106_mkt016_marketing_consent_storage.sql";
  const manifest = fs.readFileSync(new URL("supabase/MIGRATION_ORDER.txt", root), "utf8");
  const entries = manifest.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  assert.equal(entries.filter(line => line === migration).length, 1);
  const sql = fs.readFileSync(new URL("supabase/migrations/" + migration, root), "utf8");
  for (const table of ["marketing_consent_current", "marketing_consent_audit"]) {
    assert.match(sql, new RegExp("ALTER TABLE public\\." + table + " FORCE ROW LEVEL SECURITY", "i"));
    assert.match(sql, new RegExp("REVOKE ALL ON public\\." + table + " FROM PUBLIC, anon, authenticated", "i"));
  }
  assert.match(sql, /SECURITY DEFINER SET search_path = pg_catalog, public/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.record_marketing_consent_event\(/i);
  assert.match(sql, /TO service_role;/i);
});


test("MKT-016 audit history cannot be updated or deleted after recording", () => {
  const root = new URL("../../../../", import.meta.url);
  const sql = fs.readFileSync(new URL(
    "supabase/migrations/20261106_mkt016_marketing_consent_storage.sql", root,
  ), "utf8");
  assert.match(sql, /CREATE TRIGGER marketing_consent_audit_immutable/i);
  assert.match(sql, /BEFORE UPDATE OR DELETE ON public\.marketing_consent_audit/i);
  assert.match(sql, /FOR EACH ROW EXECUTE FUNCTION public\.reject_marketing_consent_audit_mutation\(\)/i);
  assert.match(sql, /RAISE EXCEPTION 'marketing consent audit is append-only'/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.reject_marketing_consent_audit_mutation\(\) FROM PUBLIC, anon, authenticated/i);
});
