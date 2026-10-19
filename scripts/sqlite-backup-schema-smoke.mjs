import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createRequire } from "node:module";

const desktopRequire = createRequire(new URL("../apps/desktop/package.json", import.meta.url));
const initSqlJs = desktopRequire("sql.js/dist/sql-asm.js");
const {
  minarvaBackupSchemaError,
  REQUIRED_MINARVA_BACKUP_TABLES,
  MAX_SUPPORTED_MINARVA_BACKUP_SCHEMA_VERSION,
} = desktopRequire("./electron/dist/sqlite-backup-validation.js");

const ddlSource = fs.readFileSync(new URL("../packages/database/src/sql/sqlite-ddl.ts", import.meta.url), "utf8");
const schemaVersionMatch = /export const SQLITE_SCHEMA_VERSION = (\d+);/.exec(ddlSource);
assert.ok(schemaVersionMatch, "SQLITE_SCHEMA_VERSION must remain discoverable by backup validation smoke");
const databaseSchemaVersion = Number(schemaVersionMatch[1]);
assert.equal(
  MAX_SUPPORTED_MINARVA_BACKUP_SCHEMA_VERSION,
  databaseSchemaVersion,
  "Desktop backup validator maximum schema version must match @minarvabiz/database"
);

const SQL = await initSqlJs({});
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "minarva-schema-restore-"));

function writeDatabase(file, setup) {
  const db = new SQL.Database();
  try {
    setup(db);
    fs.writeFileSync(file, Buffer.from(db.export()));
  } finally {
    db.close();
  }
}

try {
  const valid = path.join(dir, "valid.db");
  writeDatabase(valid, (db) => {
    for (const table of REQUIRED_MINARVA_BACKUP_TABLES) {
      if (table === "meta") db.run("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
      else if (table === "domain_kv") db.run("CREATE TABLE domain_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)");
      else db.run(`CREATE TABLE ${table} (id TEXT PRIMARY KEY)`);
    }
    db.run(`INSERT INTO meta(key, value) VALUES ('schema_version', '${databaseSchemaVersion}')`);
    db.run("CREATE INDEX idx_backup_integrity_probe ON products(id)");
    db.run("INSERT INTO products(id) VALUES ('backup-structural-check')");
  });
  assert.equal(await minarvaBackupSchemaError(valid), null);

  // Corrupt an unrelated index b-tree root while preserving table metadata,
  // the valid schema version, and customer/product rows. Schema-only
  // validation used to incorrectly mark this SQLite image as verified.
  const damaged = path.join(dir, "damaged-index.db");
  const original = fs.readFileSync(valid);
  const opened = new SQL.Database(original);
  const rootPage = Number(opened.exec(
    "SELECT rootpage FROM sqlite_master WHERE name='idx_backup_integrity_probe'"
  )[0]?.values?.[0]?.[0]);
  opened.close();
  const pageSize = original.readUInt16BE(16) || 65536;
  assert.ok(Number.isSafeInteger(rootPage) && rootPage > 1,
    "Regression requires a separate index b-tree page");
  const indexPageOffset = (rootPage - 1) * pageSize;
  assert.ok(indexPageOffset > 0 && indexPageOffset < original.length);
  const changed = Buffer.from(original);
  changed[indexPageOffset] = 0; // invalid index b-tree page kind (normally 0x0a)
  fs.writeFileSync(damaged, changed);
  const damagedMetadata = new SQL.Database(changed);
  assert.equal(damagedMetadata.exec(
    "SELECT value FROM meta WHERE key='schema_version'"
  )[0].values[0][0], String(databaseSchemaVersion));
  assert.equal(damagedMetadata.exec(
    "SELECT id FROM products NOT INDEXED"
  )[0].values[0][0], "backup-structural-check");
  damagedMetadata.close();
  assert.match(String(await minarvaBackupSchemaError(damaged)),
    /structural integrity verification|SQLite database could not be opened/,
    "A corrupted backup index must not pass live-database restore validation");

  const foreign = path.join(dir, "foreign.db");
  writeDatabase(foreign, (db) => {
    db.run("CREATE TABLE unrelated_app_data (id INTEGER PRIMARY KEY, value TEXT)");
  });
  const foreignError = await minarvaBackupSchemaError(foreign);
  assert.match(String(foreignError), /Minarva Biz schema is missing required tables/);

  const noVersion = path.join(dir, "no-version.db");
  writeDatabase(noVersion, (db) => {
    for (const table of REQUIRED_MINARVA_BACKUP_TABLES) {
      if (table === "meta") db.run("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
      else if (table === "domain_kv") db.run("CREATE TABLE domain_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)");
      else db.run(`CREATE TABLE ${table} (id TEXT PRIMARY KEY)`);
    }
  });
  assert.match(
    String(await minarvaBackupSchemaError(noVersion)),
    /schema version metadata is missing or invalid/
  );

  const futureVersion = path.join(dir, "future-version.db");
  writeDatabase(futureVersion, (db) => {
    for (const table of REQUIRED_MINARVA_BACKUP_TABLES) {
      if (table === "meta") db.run("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
      else if (table === "domain_kv") db.run("CREATE TABLE domain_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)");
      else db.run(`CREATE TABLE ${table} (id TEXT PRIMARY KEY)`);
    }
    db.run(`INSERT INTO meta(key, value) VALUES ('schema_version', '${databaseSchemaVersion + 1}')`);
  });
  assert.match(
    String(await minarvaBackupSchemaError(futureVersion)),
    /newer than this app supports/
  );

  console.log("SQLite backup schema + integrity smoke PASS: healthy backup accepted; corrupted index, foreign, missing and future-schema SQLite rejected.");
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
