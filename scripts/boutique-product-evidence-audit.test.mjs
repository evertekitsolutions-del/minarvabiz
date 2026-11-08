import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { auditBoutiqueProductEvidence } from "./boutique-product-evidence-audit.mjs";

const requireDesktop = createRequire(new URL("../apps/desktop/package.json", import.meta.url));
const SQL = await requireDesktop("sql.js/dist/sql-asm.js")({});
const root = fs.mkdtempSync(path.join(os.tmpdir(), "minarva-product-forensics-"));
const backups = path.join(root, "backups");
fs.mkdirSync(backups);
const allIds = Array.from({ length: 40 }, (_, i) => "sensitive-product-id-" + String(i + 1).padStart(3, "0"));
const hash = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");

function createDb(dest, ids, normalized = ids) {
  const db = new SQL.Database();
  try {
    db.run("CREATE TABLE domain_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)");
    db.run("CREATE TABLE products (id TEXT PRIMARY KEY)");
    const snapshot = {
      products: ids.map((id) => ({ id, name: "Private customer item " + id })),
      customers: [{ name: "PRIVATE CLIENT MUST NEVER LEAK" }],
    };
    db.run("INSERT INTO domain_kv (key,value,updated_at) VALUES (?,?,?)",
      ["domain_snapshot_v2", JSON.stringify(snapshot), "2026-11-08T00:00:00Z"]);
    for (const id of normalized) db.run("INSERT INTO products (id) VALUES (?)", [id]);
    fs.writeFileSync(dest, Buffer.from(db.export()));
  } finally { db.close(); }
}

try {
  const live = path.join(root, "minarvabiz.db");
  const archived = path.join(backups, "minarvabiz-pre-update-era-wardrobe-fixture.db");
  const currentIds = allIds.slice(0, 17);
  createDb(live, currentIds, allIds);
  createDb(archived, allIds);
  fs.writeFileSync(path.join(root, "era-wardrobe-business-cleanup-v1.json"), '{"historicalReset":true}');
  const before = [hash(live), hash(archived)];
  const report = await auditBoutiqueProductEvidence(root);
  assert.equal(report.readOnly, true);
  assert.equal(report.markerPresent, true);
  assert.equal(report.current.status, "ok");
  assert.equal(report.current.snapshotCount, 17);
  assert.equal(report.current.normalizedCount, 40);
  assert.equal(report.candidates.length, 1);
  assert.equal(report.candidates[0].snapshotCount, 40);
  assert.equal(report.candidates[0].snapshotIdsMissingFromCurrent, 23);
  assert.equal(report.candidates[0].normalizedIdsMissingFromCurrentSnapshot, 23);
  assert.deepEqual([hash(live), hash(archived)], before,
    "Audit may not modify live customer database or archived file");
  const output = JSON.stringify(report);
  assert.equal(output.includes("sensitive-product-id"), false, "Never print product IDs");
  assert.equal(output.includes("PRIVATE CLIENT"), false, "Never print customer data");
  assert.equal(output.includes("Private customer item"), false, "Never print item names");

  const corrupt = path.join(backups, "damaged.db");
  fs.writeFileSync(corrupt, "not a SQLite database");
  const badReport = await auditBoutiqueProductEvidence(root);
  assert.equal(badReport.candidates.some((item) => item.filename === "damaged.db" && item.status === "unreadable"), true);
  assert.equal(hash(live), before[0], "Even a corrupted backup may not change live DB");
  console.log("P0 read-only inventory forensics PASS: 40→17 diff, normalized 23 gap, original bytes preserved, no PII");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
