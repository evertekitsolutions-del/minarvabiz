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
const { proposeSocialLeadIntake } = require("../social-lead-intake.ts");
const trusted = {
  tenantId: "tenant-1", companyId: "company-1",
  allowedBranchIds: ["branch-1"], allowedProviderAccounts: ["account-1"],
};
const lead = (patch = {}) => ({
  enabled: true, tenantId: "tenant-1", companyId: "company-1", branchId: "branch-1",
  channel: "instagram", providerAccountId: "account-1", externalLeadId: "lead-1",
  receivedAt: "2026-11-06T00:00:00Z",
  contact: { name: "A Person", email: "Person@Example.com" },
  ...patch,
});

test("canonical scoped proposal is deterministic, normalized and opt-out by default", () => {
  const result = proposeSocialLeadIntake(lead(), trusted);
  assert.equal(result.contact.email, "person@example.com");
  assert.equal(result.marketingOptIn, false);
  assert.equal(result.kind, "social_lead_intake_proposal");
  assert.equal(result.idempotencyKey, JSON.stringify(["tenant-1", "company-1", "instagram", "account-1", "lead-1"]));
  assert.deepEqual(result, proposeSocialLeadIntake(lead(), trusted));
});

test("only explicitly opted-in contacts have consent flag", () => {
  assert.equal(proposeSocialLeadIntake(lead({ marketingOptIn: true }), trusted).marketingOptIn, true);
  assert.equal(proposeSocialLeadIntake(lead({ marketingOptIn: false }), trusted).marketingOptIn, false);
  assert.throws(() => proposeSocialLeadIntake(lead({ marketingOptIn: "yes" }), trusted), /boolean/);
});

test("disabled modules and cross-tenant, company, branch or account input fail closed", () => {
  for (const patch of [
    { enabled: false }, { tenantId: "tenant-2" }, { companyId: "company-2" },
    { branchId: "branch-2" }, { providerAccountId: "account-2" },
  ]) assert.throws(() => proposeSocialLeadIntake(lead(patch), trusted));
});

test("reject invalid identifiers, unsupported channel and noncanonical timestamps", () => {
  for (const patch of [
    { externalLeadId: "../foo" }, { externalLeadId: "" }, { channel: "telegram" },
    { receivedAt: "2026-11-06T00:00:00+05:30" },
    { receivedAt: "2026-02-30T00:00:00Z" },
  ]) assert.throws(() => proposeSocialLeadIntake(lead(patch), trusted));
});

test("requires a usable contact and canonical phone or email", () => {
  for (const contact of [
    {}, { name: "Only name" }, { email: "invalid" }, { phone: "9876543210" },
    { email: " x@example.com" }, { phone: "+000000000" },
    { name: "x\nunsafe", email: "x@example.com" },
  ]) assert.throws(() => proposeSocialLeadIntake(lead({ contact }), trusted));
  assert.equal(proposeSocialLeadIntake(lead({ contact: { phone: "+919876543210" } }), trusted).contact.phone, "+919876543210");
});

test("idempotency keys separate channels, tenant identities and provider accounts", () => {
  const a = proposeSocialLeadIntake(lead(), trusted);
  const b = proposeSocialLeadIntake(lead({ channel: "facebook" }), trusted);
  const c = proposeSocialLeadIntake(lead({ externalLeadId: "lead-2" }), trusted);
  assert.notEqual(a.idempotencyKey, b.idempotencyKey);
  assert.notEqual(a.idempotencyKey, c.idempotencyKey);
});
