/**
 * Read-only local forensic inventory audit.
 * Usage: node scripts/boutique-product-evidence-audit.mjs --user-data "<Electron userData>" [--backup-dir "<external backups>"]
 * NEVER restores, replaces, creates, vacuums, modifies or publishes customer data.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const desktopRequire = createRequire(new URL("../apps/desktop/package.json", import.meta.url));
const MAX_DB_BYTES = 256 * 1024 * 1024;
const MAX_IMAGES_PER_FOLDER = 500;

function safeImagePath(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Not a regular SQLite file");
  if (stat.size < 100 || stat.size > MAX_DB_BYTES) throw new Error("File size outside safe SQLite audit limits");
  const fd = fs.openSync(file, "r");
  try {
    const magic = Buffer.alloc(16);
    fs.readSync(fd, magic, 0, magic.length, 0);
    if (!magic.equals(Buffer.from("SQLite format 3\0", "ascii"))) {
      throw new Error("SQLite header is invalid");
    }
  } finally {
    fs.closeSync(fd);
  }
  return stat;
}

function queryFirst(db, sql) {
  const result = db.exec(sql);
  return result[0]?.values?.[0]?.[0] ?? null;
}

function tableExists(db, name) {
  return Number(queryFirst(db, "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='" + name + "'")) > 0;
}

function idsFromSnapshot(raw) {
  if (raw === null) return { ids: new Set(), status: "missing" };
  let snapshot;
  try {
    snapshot = JSON.parse(String(raw));
  } catch {
    return { ids: new Set(), status: "invalid_json" };
  }
  const products = snapshot?.products;
  if (!Array.isArray(products)) return { ids: new Set(), status: "missing_products" };
  const ids = new Set();
  for (const item of products) {
    if (typeof item?.id !== "string" || !item.id.trim() || ids.has(item.id)) {
      return { ids: new Set(), status: "invalid_ids" };
    }
    ids.add(item.id);
  }
  return { ids, status: "ok" };
}

export function inspectProductImage(SQL, file) {
  const stat = safeImagePath(file);
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(file)));
  try {
    db.run("PRAGMA query_only=ON");
    const integrity = String(queryFirst(db, "PRAGMA quick_check") ?? "");
    if (integrity.toLowerCase() !== "ok") {
      return { filename: path.basename(file), bytes: stat.size, status: "integrity_failed" };
    }
    const hasDomain = tableExists(db, "domain_kv");
    const hasProducts = tableExists(db, "products");
    if (!hasDomain && !hasProducts) {
      return { filename: path.basename(file), bytes: stat.size, status: "not_minerva_database" };
    }
    const raw = hasDomain
      ? queryFirst(db, "SELECT value FROM domain_kv WHERE key='domain_snapshot_v2'")
      : null;
    const parsed = idsFromSnapshot(raw);
    const normalizedIds = hasProducts
      ? new Set((db.exec("SELECT id FROM products")[0]?.values || []).map((row) => String(row[0])))
      : new Set();
    return {
      filename: path.basename(file),
      bytes: stat.size,
      status: "ok",
      snapshotStatus: parsed.status,
      snapshotCount: parsed.status === "ok" ? parsed.ids.size : null,
      normalizedCount: hasProducts ? normalizedIds.size : null,
      // Used internally for matching only. Never emitted in customer support reports.
      _ids: parsed.ids,
      _normalizedIds: normalizedIds,
    };
  } finally {
    db.close();
  }
}

function listImagePaths(folder) {
  if (!fs.existsSync(folder)) return [];
  const stat = fs.lstatSync(folder);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("Backup folder must be a normal directory, not a symbolic link");
  }
  const names = fs.readdirSync(folder)
    .filter((name) => name.toLowerCase().endsWith(".db"))
    .sort();
  if (names.length > MAX_IMAGES_PER_FOLDER) throw new Error("Too many backup images; select a narrower folder");
  return names.map((name) => path.join(folder, name));
}

function redact(image, baseline) {
  if (image.status !== "ok") return image;
  const compare = baseline?.status === "ok" && baseline.snapshotStatus === "ok";
  const counts = {
    filename: image.filename,
    bytes: image.bytes,
    status: image.status,
    snapshotStatus: image.snapshotStatus,
    snapshotCount: image.snapshotCount,
    normalizedCount: image.normalizedCount,
  };
  if (compare && image.snapshotStatus === "ok") {
    counts.snapshotIdsMissingFromCurrent = [...image._ids].filter((id) => !baseline._ids.has(id)).length;
    counts.currentSnapshotIdsAbsentFromImage = [...baseline._ids].filter((id) => !image._ids.has(id)).length;
  }
  if (compare && image._normalizedIds) {
    counts.normalizedIdsMissingFromCurrentSnapshot = [...image._normalizedIds]
      .filter((id) => !baseline._ids.has(id)).length;
  }
  return counts;
}

export async function auditBoutiqueProductEvidence(userData, extraBackupDirs = []) {
  const SQL = await desktopRequire("sql.js/dist/sql-asm.js")({});
  const dir = path.resolve(userData);
  if (!fs.existsSync(dir) || !fs.lstatSync(dir).isDirectory() || fs.lstatSync(dir).isSymbolicLink()) {
    throw new Error("Electron userData folder is missing or unsafe");
  }
  const inspect = (file) => {
    try {
      return inspectProductImage(SQL, file);
    } catch (error) {
      return { filename: path.basename(file), status: "unreadable", error: error instanceof Error ? error.message : String(error) };
    }
  };
  const currentFile = path.join(dir, "minarvabiz.db");
  const current = inspect(currentFile);
  const folders = [...new Set([path.join(dir, "backups"), ...extraBackupDirs.map((d) => path.resolve(d))])];
  const candidatePaths = [...new Set(folders.flatMap(listImagePaths))];
  const candidates = candidatePaths.map(inspect).map((candidate) => redact(candidate, current))
    .sort((a, b) => (b.snapshotIdsMissingFromCurrent ?? 0) - (a.snapshotIdsMissingFromCurrent ?? 0));
  const currentReport = redact(current, null);
  return {
    readOnly: true,
    markerPresent: fs.existsSync(path.join(dir, "era-wardrobe-business-cleanup-v1.json")),
    current: currentReport,
    inspectedBackups: candidates.length,
    candidates,
    recommendation: "Do not restore or overwrite. Review missing counts and perform a separately approved, audited record-level recovery only.",
  };
}

const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedFile === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const userAt = args.indexOf("--user-data");
  const userData = userAt >= 0 ? args[userAt + 1] : null;
  const backups = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--backup-dir" && args[i + 1]) backups.push(args[++i]);
  }
  if (!userData || args.some((value) => value === "--help")) {
    console.error("Usage: node scripts/boutique-product-evidence-audit.mjs --user-data <local Electron folder> [--backup-dir <backup folder>]");
    process.exitCode = 2;
  } else {
    auditBoutiqueProductEvidence(userData, backups).then(
      (report) => console.log(JSON.stringify(report, null, 2)),
      (error) => { console.error("Local read-only audit could not finish:", error.message); process.exitCode = 1; },
    );
  }
}
