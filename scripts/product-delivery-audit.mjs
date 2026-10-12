/**
 * Minarva Biz product-delivery coverage audit.
 *
 * SCOPE COVERAGE IS NOT IMPLEMENTATION/ACCEPTANCE.
 * Source PRs and CI runs alone cannot update the historical Master Vision %.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const REGISTRY_ROW = /^\|\s*([A-Z]{2,5}-\d{3})\s*\|/;
const AI_ID = /\bAI-[A-Z]+-\d{3}\b/g;
const PHASES = ["A", "B", "C", "D", "E", "F"];
const STATUS = new Set(["acceptance_not_verified", "in_progress", "blocked", "accepted"]);

export function readRegistryGroups(markdown) {
  assert.equal(typeof markdown, "string");
  const groups = new Map();
  const seen = new Set();
  let section = "";
  for (const line of markdown.split(/\r?\n/)) {
    if (line.startsWith("## ")) section = line.slice(3).trim();
    const match = REGISTRY_ROW.exec(line);
    if (!match) continue;
    assert.ok(section, "Capability row outside a registry section");
    assert.ok(!seen.has(match[1]), "Duplicate capability ID: " + match[1]);
    seen.add(match[1]);
    if (!groups.has(section)) groups.set(section, []);
    groups.get(section).push(match[1]);
  }
  assert.ok(seen.size > 0, "Empty capability registry");
  return groups;
}

export function auditProductDelivery(backlog, capabilityMd, aiMd) {
  assert.equal(backlog?.schemaVersion, 1);
  assert.equal(backlog?.repository, "evertekitsolutions-del/minarvabiz");
  assert.ok(Array.isArray(backlog.initiatives) && backlog.initiatives.length > 0);
  const groups = readRegistryGroups(capabilityMd);
  const ai = new Set(aiMd.match(AI_ID) || []);
  assert.ok(ai.size > 0, "AI capability registry lost");
  assert.ok(backlog.aiRegistry === "docs/AI_CAPABILITY_REGISTRY.md");
  const seen = new Set(), priorities = new Set(), covered = new Set(), phases = new Set();
  const accepted = [];
  const errors = [];
  for (const item of backlog.initiatives) {
    assert.match(item.id, /^[A-F]-[A-Z0-9-]{3,80}$/);
    assert.ok(!seen.has(item.id), "Duplicate delivery outcome: " + item.id);
    seen.add(item.id);
    assert.ok(PHASES.includes(item.phase), "Unknown phase: " + item.phase);
    assert.equal(item.phase, item.id[0], "Phase and ID mismatch");
    phases.add(item.phase);
    assert.ok(Number.isSafeInteger(item.priority) && item.priority > 0);
    assert.ok(!priorities.has(item.priority), "Duplicate delivery priority " + item.priority);
    priorities.add(item.priority);
    assert.ok(typeof item.criticalOutcome === "string" && item.criticalOutcome.length >= 40,
      "Missing customer-visible end-to-end outcome for " + item.id);
    assert.ok(STATUS.has(item.status), "Unknown acceptance status " + item.id);
    assert.ok(Array.isArray(item.registryGroups));
    assert.ok(Array.isArray(item.acceptanceEvidence), "Acceptance evidence must be explicit");
    for (const group of item.registryGroups) {
      assert.ok(groups.has(group), "Unknown registry group in " + item.id + ": " + group);
      covered.add(group);
    }
    if (item.status === "accepted") {
      // A machine-readable record is necessary but not sufficient: real
      // customer UAT/CI/release must also be independently reviewed.
      const proof = item.acceptanceEvidence;
      for (const kind of ["source_pr", "exact_head_ci", "postmerge_ci", "uat", "release", "reviewer"]) {
        assert.ok(proof.some(e => e?.kind === kind && typeof e.reference === "string" && e.reference.length >= 8),
          "Accepted outcome missing " + kind + " evidence: " + item.id);
      }
      accepted.push(item.id);
    } else if (item.acceptanceEvidence.length > 0) {
      errors.push("Pending validation of supplied " + item.id + " evidence");
    }
  }
  for (const item of backlog.initiatives) for (const dependency of item.dependsOn || [])
    assert.ok(seen.has(dependency) && dependency !== item.id,
      "Unrecognized/self delivery dependency for " + item.id);
  assert.deepEqual([...phases].sort(), PHASES, "A–F product phases must remain in scope");
  const missing = [...groups.keys()].filter(g => !covered.has(g));
  assert.deepEqual(missing, [], "Master capability groups missing: " + missing.join(", "));
  assert.ok(Array.isArray(backlog.sharedAcceptance) && backlog.sharedAcceptance.length >= 4,
    "Online/Offline/Hybrid/CI/UAT acceptance contract missing");
  return {
    registryCapabilitiesInScope: [...groups.values()].reduce((n, ids) => n + ids.length, 0),
    registryGroupsInScope: groups.size,
    aiCapabilitiesInScope: ai.size,
    deliveryOutcomesInScope: backlog.initiatives.length,
    acceptedWithDocumentedEvidence: accepted.length,
    acceptanceUnverified: backlog.initiatives.length - accepted.length,
    baselinePercentProvisional: backlog.baseline.fullMasterVisionEstimatePercent,
    computedFullVisionPercent: null,
    warnings: errors,
    note: "Coverage of required scope does NOT establish implementation, release readiness or verified percentage.",
  };
}

export function runDeliveryAudit(root = ".") {
  const read = file => fs.readFileSync(root + "/" + file, "utf8");
  const backlog = JSON.parse(read("docs/PRODUCT_DELIVERY_BACKLOG.json"));
  return auditProductDelivery(backlog,
    read("docs/CAPABILITY_REGISTRY.md"), read("docs/AI_CAPABILITY_REGISTRY.md"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = runDeliveryAudit();
    console.log("MINARVA_DELIVERY_AUDIT " + JSON.stringify(result));
  } catch (error) {
    console.error("MINARVA_DELIVERY_AUDIT_FAILED:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
