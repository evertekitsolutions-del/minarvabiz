import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (m, filename) => m._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  filename,
);

const { prepareBrowserSnapshotDownload } = require("../browser-snapshot-download.ts");
const persistence = fs.readFileSync("packages/business-logic/src/persistence.ts", "utf8");
const page = fs.readFileSync("apps/web/src/app/(app)/backup/page.tsx", "utf8");
const panel = fs.readFileSync("packages/ui/src/components/backup/BackupPanel.tsx", "utf8");

const required = [
  "customers", "products", "categories", "sales", "payments", "orders",
  "measurements", "laundry", "expenses", "purchases", "suppliers",
  "expenseCategories", "staff", "assignments", "incentiveRules", "payouts",
  "notifications", "returns", "audit", "branches",
];

function snapshot() {
  return {
    version: 15, exportedAt: "2026-10-12T04:00:00.000Z",
    ...Object.fromEntries(required.map(x => [x, []])),
    shopProfile: { shopName: "Sample only" },
    warehouse: { warehouses: [{ id: "w-1" }], locations: [], stock: [] },
    accounting: { accounts: [], journals: [{ id: "journal-1" }] },
    onboardingCompletedIds: ["shop"],
    outbox: [],
  };
}

test("download keeps full original v15 local snapshot including accounting and stock metadata", () => {
  const data = snapshot();
  const json = JSON.stringify(data);
  const result = prepareBrowserSnapshotDownload(json, 15, new Date("2026-10-12T05:00:00.000Z"));
  assert.match(result.filename, /^minarvabiz-local-business-snapshot-v15-2026-10-12T05-00-00-000Z\.json$/);
  assert.equal(result.mediaType, "application/json");
  assert.equal(result.content, json, "Do not discard domain or unknown forward-compatible fields");
  assert.deepEqual(JSON.parse(result.content), data);
  assert.equal(Object.keys(result.recordCounts).length, required.length);
  assert.equal(result.recordCounts.branches, 0);
});

test("reject previous partial archives, corrupted JSON and incorrect schema instead of implying full recovery", () => {
  const full = snapshot();
  for (const removed of required) {
    const incomplete = { ...full };
    delete incomplete[removed];
    assert.throws(() => prepareBrowserSnapshotDownload(JSON.stringify(incomplete), 15), /Incomplete business snapshot/);
  }
  for (const invalid of ["", "not json", "null", "[]"]) {
    assert.throws(() => prepareBrowserSnapshotDownload(invalid, 15));
  }
  assert.throws(() => prepareBrowserSnapshotDownload(JSON.stringify({ ...full, version: 1 }), 15), /version mismatch/);
  assert.throws(() => prepareBrowserSnapshotDownload(JSON.stringify({ ...full, exportedAt: "bad" }), 15), /timestamp/);
  assert.throws(() => prepareBrowserSnapshotDownload(JSON.stringify({ ...full, sales: {} }), 15), /sales/);
});

test("Web UI uses shared full domain serializer and validates before permissioned download", () => {
  assert.match(page, /can\("backup\.manage"\)/);
  assert.match(page, /exportDomainSnapshotJson\(\)/);
  assert.match(page, /prepareBrowserSnapshotDownload\(exportDomainSnapshotJson\(\), SNAPSHOT_VERSION\)/);
  assert.match(page, /validateDomainSnapshot\(JSON\.parse\(file\.content\)\)/);
  assert.match(page, /This is not a cloud-server backup/);
  assert.match(page, /legacyPartialArchive/);
  assert.match(persistence, /export function exportDomainSnapshotFull/);
  assert.match(persistence, /export function exportDomainSnapshotJson/);
  assert.match(persistence, /onboardingCompletedIds: onboarding\.exportOnboardingIds\(\)/);
  assert.doesNotMatch(page, /phase7Store\.createBackup/);
});

test("preserve existing historical partial archive downloads and true Windows native backups", () => {
  assert.match(page, /phase7Store\.getBackupPayload/);
  assert.match(panel, /const limitedWebArchive = legacyPartialArchive && !native\?\.listBackups/);
  assert.match(panel, /native\?\.restoreBackup/);
  assert.match(panel, /native\?\.createManualBackup/);
  assert.match(panel, /Legacy partial export format checked/);
  assert.match(panel, /limitedWebArchive \? "Previous limited exports"/);
});
