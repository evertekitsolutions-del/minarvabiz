import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { auditProductDelivery, readRegistryGroups, runDeliveryAudit } from "../../../../scripts/product-delivery-audit.mjs";

const read = p => fs.readFileSync(p, "utf8");
const registry = read("docs/CAPABILITY_REGISTRY.md");
const aiRegistry = read("docs/AI_CAPABILITY_REGISTRY.md");
const delivery = JSON.parse(read("docs/PRODUCT_DELIVERY_BACKLOG.json"));
const audit = () => auditProductDelivery(delivery, registry, aiRegistry);

test("all six phases and registered business/AI capabilities remain in delivery scope", () => {
  const result = audit();
  assert.equal(result.registryCapabilitiesInScope, 329, "Source registry must not silently lose capabilities");
  assert.equal(result.registryGroupsInScope, 18);
  assert.equal(result.aiCapabilitiesInScope, 111, "All AI registry IDs must remain in scope");
  assert.equal(result.deliveryOutcomesInScope, 23);
  assert.equal(result.acceptedWithDocumentedEvidence, 0, "Do not invent feature acceptance");
  assert.equal(result.computedFullVisionPercent, null,
    "Never pretend registry scope coverage or passing PRs is full-product progress");
  assert.equal(result.baselinePercentProvisional, 51);
  assert.deepEqual(result, runDeliveryAudit());
});

test("remove any registry group or entire phase -> audit fails closed", () => {
  const missingGroup = structuredClone(delivery);
  missingGroup.initiatives = missingGroup.initiatives.map(i => ({
    ...i, registryGroups: i.registryGroups.filter(group => group !== "Marketing"),
  }));
  assert.throws(() => auditProductDelivery(missingGroup, registry, aiRegistry), /missing/i);
  const noPhase = structuredClone(delivery);
  noPhase.initiatives = noPhase.initiatives.filter(i => i.phase !== "F");
  assert.throws(() => auditProductDelivery(noPhase, registry, aiRegistry), /phases/i);
});

test("duplicate capability IDs, wrong registry group and fake acceptance fail", () => {
  assert.throws(() => readRegistryGroups(registry + "\n| PLT-001 | Duplicate | Core |"), /Duplicate/);
  const wrongGroup = structuredClone(delivery);
  wrongGroup.initiatives[0].registryGroups.push("Fake module");
  assert.throws(() => auditProductDelivery(wrongGroup, registry, aiRegistry), /Unknown registry group/);
  const fake = structuredClone(delivery);
  fake.initiatives[0].status = "accepted";
  fake.initiatives[0].acceptanceEvidence = [{ kind: "source_pr", reference: "https://github.com/example" }];
  assert.throws(() => auditProductDelivery(fake, registry, aiRegistry), /missing exact_head_ci/);
});

test("duplicate/unknown tasks and weakening of acceptance contracts fail", () => {
  const duplicate = structuredClone(delivery);
  duplicate.initiatives.push({ ...duplicate.initiatives[0], priority: 99 });
  assert.throws(() => auditProductDelivery(duplicate, registry, aiRegistry), /Duplicate delivery outcome/);
  const missing = structuredClone(delivery);
  missing.initiatives[0].dependsOn = ["FUTURE-NOT-SCOPED"];
  assert.throws(() => auditProductDelivery(missing, registry, aiRegistry), /Unrecognized/);
  const reduced = structuredClone(delivery);
  reduced.sharedAcceptance = ["CI passed"];
  assert.throws(() => auditProductDelivery(reduced, registry, aiRegistry), /acceptance contract/);
});

test("development priority queue and agent remain separate from product acceptance", () => {
  const queue = JSON.parse(read("docs/DEVELOPMENT_TASK_QUEUE.json"));
  assert.equal(queue.fullMasterVisionEstimatedPercent, delivery.baseline.fullMasterVisionEstimatePercent);
  const roadmap = queue.productDeliveryBacklog;
  assert.equal(roadmap, "docs/PRODUCT_DELIVERY_BACKLOG.json");
  const agent = read(".github/workflows/minarva-source-agent.yml");
  assert.match(agent, /MINARVA_COPILOT_AUTOCODE_ENABLED == 'true'/);
  assert.match(agent, /contents: read/);
  assert.doesNotMatch(agent, /gh pr merge|git push|pull-requests: write/);
});
