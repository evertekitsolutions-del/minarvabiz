import test from "node:test";
import assert from "node:assert/strict";
import { buildMeasurement, parseCapabilityRegistry } from "./master-vision-measurement.mjs";

test("parse registry scope exactly, reject duplicates", () => {
  const registry = "## Inventory\n| INV-001 | Product | Core |\n| INV-002 | Stock | Core |";
  assert.equal(parseCapabilityRegistry(registry).length, 2);
  assert.throws(() => parseCapabilityRegistry("## A\n| INV-001 | One | Core |\n| INV-001 | Two | Core |"), /Duplicate/);
});

test("no acceptance evidence means unknown, not invented 51%", () => {
  const product = "## Inventory\n| INV-001 | Product | Core |\n| INV-002 | Stock | Core |";
  const ai = "## AI\n| AI-FIN-001 | Finance | AI |";
  const result = buildMeasurement({ capabilityMarkdown: product, aiMarkdown: ai, assessments: { schemaVersion: 1, assessments: {} } });
  assert.equal(result.totalCapabilities, 3);
  assert.equal(result.verifiedPoints, 0);
  assert.equal(result.totalPoints, 15);
  assert.equal(result.verifiedPercent, 0);
  assert.equal(result.unassessedCapabilities, 3);
  assert.equal(result.actualCompletionPercent, null);
});

test("only documented verified gates earn points; unaudited claims do not", () => {
  const r = "## Inventory\n| INV-001 | Product | Core |";
  const evidence = { schemaVersion: 1, assessments: { "INV-001": { source: {reference:"https://github.com/example/a",verifiedBy:"reviewer",verifiedAt:"2026-10-14"}, tests: {reference:"",verifiedBy:"reviewer",verifiedAt:"2026-10-14"} } } };
  const result = buildMeasurement({capabilityMarkdown:r,aiMarkdown:"",assessments:evidence});
  assert.equal(result.verifiedPoints,1);
  assert.equal(result.totalPoints,5);
  assert.equal(result.verifiedPercent,20);
  assert.equal(result.rows[0].status,"partially_evidenced");
  assert.deepEqual(result.rows[0].missingGates,["tests","ci","deployment","uat"]);
});

test("reject out-of-scope evidence and inconsistent completion", () => {
  const r = "## Inventory\n| INV-001 | Product | Core |";
  assert.throws(()=>buildMeasurement({capabilityMarkdown:r,aiMarkdown:"",assessments:{schemaVersion:1,assessments:{"BOGUS-100":{}}}}),/Unknown capability/);
  assert.throws(()=>buildMeasurement({capabilityMarkdown:r,aiMarkdown:"",assessments:{schemaVersion:1,assessments:{"INV-001":{uat:{reference:"https://example.com/uat",verifiedBy:"r",verifiedAt:"2026-10-14"}}}}}),/UAT requires/);
});
