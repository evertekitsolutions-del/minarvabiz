/**
 * Evidence-scored Master Vision tracker.
 * Evidence recording is NOT automatic proof of correctness: an assessor must
 * inspect the linked artifacts before committing this register.
 * 440 capabilities x 5 equally weighted acceptance gates = 2,200 points.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const GATES = Object.freeze(["source", "tests", "ci", "deployment", "uat"]);
const CAPABILITY_ROW = /^\|\s*([A-Z]{2,5}-\d{3})\s*\|\s*([^|]+)\|/;
const AI_ROW = /^\|\s*(AI-[A-Z]+-\d{3})\s*\|\s*([^|]+)\|/;

export function parseCapabilityRegistry(markdown, isAi = false) {
  const parsed = [];
  const seen = new Set();
  let group = "Uncategorized";
  for (const line of markdown.split(/\r?\n/)) {
    if (line.startsWith("## ")) group = line.slice(3).trim();
    const match = (isAi ? AI_ROW : CAPABILITY_ROW).exec(line);
    if (!match) continue;
    if (seen.has(match[1])) throw new Error("Duplicate capability " + match[1]);
    seen.add(match[1]);
    parsed.push({ id: match[1], name: match[2].trim(), group, kind: isAi ? "ai" : "product" });
  }
  if (isAi && parsed.length === 0) {
    const unique = [...new Set(markdown.match(/\bAI-[A-Z]+-\d{3}\b/g) ?? [])];
    return unique.map(id => ({ id, name: id, group: "AI capabilities", kind: "ai" }));
  }
  return parsed;
}

function validEvidence(record) {
  return Boolean(record &&
    typeof record.reference === "string" && /^https:\/\/\S{8,}$/.test(record.reference) &&
    typeof record.verifiedBy === "string" && record.verifiedBy.trim().length >= 2 &&
    typeof record.verifiedAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(record.verifiedAt));
}

export function buildMeasurement({capabilityMarkdown, aiMarkdown, assessments}) {
  if (assessments?.schemaVersion !== 1 || !assessments.assessments || typeof assessments.assessments !== "object") {
    throw new Error("Measurement register schemaVersion 1 and assessments object required");
  }
  const capabilities = [...parseCapabilityRegistry(capabilityMarkdown), ...parseCapabilityRegistry(aiMarkdown, true)];
  const ids = new Set(capabilities.map(x => x.id));
  if (ids.size !== capabilities.length) throw new Error("Duplicate capability across registries");
  for (const id of Object.keys(assessments.assessments)) {
    if (!ids.has(id)) throw new Error("Unknown capability: " + id);
    const assessment = assessments.assessments[id];
    if (!assessment || typeof assessment !== "object") throw new Error("Invalid assessment " + id);
    for (const gate of Object.keys(assessment)) if (!GATES.includes(gate)) {
      throw new Error("Unknown evidence gate " + id + ":" + gate);
    }
    if (validEvidence(assessment.uat) && !validEvidence(assessment.deployment)) {
      throw new Error("UAT requires deployment evidence for " + id);
    }
  }
  const rows = capabilities.map(capability => {
    const assessment = assessments.assessments[capability.id] ?? {};
    const earnedGates = GATES.filter(gate => validEvidence(assessment[gate]));
    const missingGates = GATES.filter(gate => !earnedGates.includes(gate));
    return {
      ...capability,
      verifiedPoints: earnedGates.length,
      possiblePoints: GATES.length,
      percent: Number((100 * earnedGates.length / GATES.length).toFixed(2)),
      status: earnedGates.length === 5 ? "evidence_recorded_all_gates" : earnedGates.length ? "partially_evidenced" : "unassessed",
      earnedGates,
      missingGates,
    };
  });
  const verifiedPoints = rows.reduce((sum, item) => sum + item.verifiedPoints, 0);
  const totalPoints = capabilities.length * GATES.length;
  return {
    methodology: "Equal capability weight; five 20%-each evidence gates. Evidence-recorded score is not independently validated product completion.",
    totalCapabilities: capabilities.length,
    productCapabilities: capabilities.filter(x => x.kind === "product").length,
    aiCapabilities: capabilities.filter(x => x.kind === "ai").length,
    totalPoints, verifiedPoints,
    verifiedPercent: Number((100 * verifiedPoints / (totalPoints || 1)).toFixed(2)),
    unassessedCapabilities: rows.filter(x => x.status === "unassessed").length,
    fullyEvidencedCapabilities: rows.filter(x => x.verifiedPoints === 5).length,
    actualCompletionPercent: null,
    rows,
  };
}

function markdownReport(measurement) {
  const summary = [
    "# Minarva Biz — Master Vision Measurement",
    "",
    "**This is an evidence-recording score, not the real-world percent of code implemented.**",
    "",
    `Scope: ${measurement.totalCapabilities} capabilities (${measurement.productCapabilities} product + ${measurement.aiCapabilities} AI).`,
    `Documented gates: **${measurement.verifiedPoints} / ${measurement.totalPoints} points** (${measurement.verifiedPercent.toFixed(2)}%).`,
    `Unassessed: ${measurement.unassessedCapabilities} items. Actual implementation completion: **unknown until assessment**.`,
    "",
    "| ID | Capability | Category | Points | Documented % | Missing evidence |",
    "|---|---|---|---:|---:|---|",
  ];
  for (const row of measurement.rows) {
    summary.push(`| ${row.id} | ${row.name.replace(/\|/g, "/")} | ${row.kind} | ${row.verifiedPoints}/5 | ${row.percent.toFixed(2)}% | ${row.missingGates.join(", ") || "none"} |`);
  }
  return summary.join("\n") + "\n";
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(invokedPath), "..");
  const read = file => fs.readFileSync(path.join(root, file), "utf8");
  const result = buildMeasurement({
    capabilityMarkdown: read("docs/CAPABILITY_REGISTRY.md"),
    aiMarkdown: read("docs/AI_CAPABILITY_REGISTRY.md"),
    assessments: JSON.parse(read("docs/MASTER_VISION_EVIDENCE.json")),
  });
  if (result.productCapabilities !== 329 || result.aiCapabilities !== 111) throw new Error("Scope drift: audit registries before changing baselines");
  process.stdout.write(process.argv.includes("--json") ? JSON.stringify(result, null, 2) + "\n" : markdownReport(result));
}
