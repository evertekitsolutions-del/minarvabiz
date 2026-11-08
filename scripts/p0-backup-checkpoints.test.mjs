import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = (path) => fs.readFileSync(path, "utf8");
function loadTypeScript(content, mocks) {
  const compiled = ts.transpileModule(content, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function("require", "exports", compiled)((specifier) => {
    assert.ok(Object.hasOwn(mocks, specifier), "Unexpected import: " + specifier);
    return mocks[specifier];
  }, exports);
  return exports;
}

test("legacy daily auto backup settings migrate to hourly with 48 verified recovery points", () => {
  const backup = loadTypeScript(source("packages/business-logic/src/auto-backup.ts"), {
    "@minarvabiz/utils": { generateId: () => "audit-1", nowISO: () => new Date().toISOString() },
    "./permissions": { assertPermission: () => {} },
    "./autosave": { touchPersistence: () => {} },
    "./audit-actions": { auditAction: () => {} },
  });
  assert.equal(backup.getAutoBackupSettings().intervalHours, 1);
  assert.equal(backup.getAutoBackupSettings().retentionCount, 48);
  const lastBackupAt = new Date(Date.now() - 2 * 3600_000).toISOString();
  backup.hydrateAutoBackup({ settings: {
    enabled: true, intervalHours: 24, retentionCount: 14,
    destinationPath: "D:\\Minarva Biz Backups", lastBackupAt,
    lastBackupPath: "D:\\Minarva Biz Backups\\old.db", lastError: null,
  }});
  const upgraded = backup.getAutoBackupSettings();
  assert.equal(upgraded.intervalHours, 1);
  assert.equal(upgraded.retentionCount, 48);
  assert.equal(upgraded.lastBackupAt, lastBackupAt, "Existing backup evidence must not be discarded");
  assert.equal(upgraded.lastBackupPath, "D:\\Minarva Biz Backups\\old.db");
  assert.equal(backup.shouldRunAutoBackup(), true);
  backup.hydrateAutoBackup({ settings: {
    ...upgraded, intervalHours: 6, retentionCount: 20,
  }});
  assert.equal(backup.getAutoBackupSettings().intervalHours, 6,
    "Explicitly customized backup policy must survive migration");
  assert.equal(backup.getAutoBackupSettings().retentionCount, 20);
});

test("each acknowledged product Save triggers a verified native recovery checkpoint", async () => {
  const events = [];
  const checkpoint = loadTypeScript(source("apps/desktop/src/lib/product-recovery-checkpoint.ts"), {
    "@minarvabiz/business-logic": {
      getAutoBackupSettings: () => ({ retentionCount: 48 }),
      recordBackupSuccess: (...args) => events.push(["success", ...args]),
      recordBackupFailure: (message) => events.push(["failure", message]),
    },
  });
  let calls = 0;
  const result = await checkpoint.createProductRecoveryCheckpoint({
    createAutomaticBackup: async (retention) => {
      calls++;
      assert.equal(retention, 48);
      return { ok: true, path: "D:\\Minarva Biz Backups\\fresh.db", sizeBytes: 4096 };
    },
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(calls, 1);
  assert.deepEqual(events, [["success", "D:\\Minarva Biz Backups\\fresh.db", "auto", 4096]]);

  const noFile = await checkpoint.createProductRecoveryCheckpoint({
    createAutomaticBackup: async () => ({ ok: true }),
  });
  assert.equal(noFile.ok, false, "Unverified files must never be recorded as a valid backup");
  const rejected = await checkpoint.createProductRecoveryCheckpoint({
    createAutomaticBackup: async () => { throw new Error("D: drive offline"); },
  });
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /D: drive offline/);
  assert.equal((await checkpoint.createProductRecoveryCheckpoint(undefined)).ok, false);
  assert.equal(events.filter(e => e[0] === "failure").length, 3);
});

test("backup is only attempted after SQLite Save acknowledgement; failures remain visible", () => {
  const app = source("apps/desktop/src/App.tsx");
  const hook = source("apps/desktop/src/lib/use-verified-auto-backup.ts");
  const banner = source("apps/desktop/src/components/DesktopBackupHealthBanner.tsx");
  const save = app.slice(app.indexOf("async function handleSaveProduct()"),
    app.indexOf("function handleAdjustStock()"));
  assert.ok(save.includes("if (!await persistProductAndRefresh())"));
  assert.ok(save.indexOf("if (!await persistProductAndRefresh())") <
    save.indexOf("await createProductRecoveryCheckpoint(window.minarvaDesktop)"));
  assert.ok(save.indexOf("await createProductRecoveryCheckpoint") < save.indexOf("setProductOpen(false)"));
  assert.match(save, /Product saved to SQLite, but recovery backup failed/);
  assert.match(app, /<DesktopBackupHealthBanner error=\{backupSettings\.lastError\}/);
  assert.match(banner, /role="alert"/);
  assert.match(hook, /if \(!await persistDomainToSqlite\(\)\)/);
  assert.ok(hook.indexOf("if (!await persistDomainToSqlite())") <
    hook.indexOf("await api.createAutomaticBackup(retentionCount)"));
  assert.match(hook, /RETRY_COOLDOWN_MS/);
  assert.match(hook, /setInterval\(\(\) => \{ void check\(\); \}, 5 \* 60_000\)/);
  assert.match(hook, /recordBackupFailure/);
  assert.match(hook, /refreshAll\(\)/);
});


test("desktop upgrade cannot rewrite a SQLite snapshot after product hydration drops IDs", () => {
  const guard = loadTypeScript(source("apps/desktop/src/lib/product-hydration-guard.ts"), {});
  const check = guard.assertHydratedProductsPreserved;
  const valid = { products: [{ id: "old-a" }, { id: "old-b" }] };
  assert.doesNotThrow(() => check(valid, [{ id: "old-b" }, { id: "old-a" }]));
  assert.throws(() => check(valid, [{ id: "old-a" }]), /SQLite startup blocked/);
  assert.throws(() => check(valid, [{ id: "old-a" }, { id: "wrong" }]), /SQLite startup blocked/);
  assert.throws(() => check(valid, [{ id: "old-a" }, { id: "old-a" }]), /SQLite startup blocked/);
  assert.throws(() => check({ products: [null] }, []), /SQLite startup blocked/);
  assert.doesNotThrow(() => check({ products: [] }, []));
  const bootstrap = source("apps/desktop/src/lib/sqlite-bootstrap.ts");
  const start = bootstrap.indexOf("const snap = loadSnap(db)");
  const barrier = bootstrap.indexOf("assertHydratedProductsPreserved(snap, store.exportCoreState().products)");
  const firstSave = bootstrap.indexOf("const persisted = await persistDomainToSqlite()", start);
  assert.ok(start >= 0 && barrier > start && firstSave > barrier,
    "Hydrated product IDs must be validated before the first native SQLite overwrite");
});


test("P0 customer, sale and payment IDs survive hydration before SQLite startup can persist", () => {
  const guard = loadTypeScript(source("apps/desktop/src/lib/product-hydration-guard.ts"), {});
  const verify = guard.assertHydratedCoreRecordsPreserved;
  const before = {
    customers: [{ id: "customer-1" }, { id: "customer-2" }],
    sales: [{ id: "invoice-1" }, { id: "invoice-2" }],
    payments: [{ id: "receipt-1" }, { id: "receipt-2" }],
  };
  assert.doesNotThrow(() => verify(before, {
    customers: [...before.customers].reverse(),
    sales: [...before.sales].reverse(),
    payments: [...before.payments].reverse(),
  }));
  for (const field of ["customers", "sales", "payments"]) {
    const bad = { ...before, [field]: before[field].slice(0, 1) };
    assert.throws(() => verify(before, bad), new RegExp("hydrated " + field + " IDs differ"));
    const duplicate = { ...before, [field]: [before[field][0], before[field][0]] };
    assert.throws(() => verify(before, duplicate), new RegExp("hydrated " + field + " IDs differ"));
  }
  assert.throws(
    () => verify({ ...before, payments: "corrupt" }, before),
    /persisted payments records are malformed/,
  );
  assert.doesNotThrow(() => verify({ products: [] }, {}), "Absent historical keys must be allowed");

  const bootstrap = source("apps/desktop/src/lib/sqlite-bootstrap.ts");
  const initialLoad = bootstrap.indexOf("const snap = loadSnap(db)");
  const safety = bootstrap.indexOf("assertHydratedCoreRecordsPreserved(snap, store.exportCoreState())");
  const firstWrite = bootstrap.indexOf("const persisted = await persistDomainToSqlite()", initialLoad);
  assert.ok(initialLoad >= 0 && safety > initialLoad && firstWrite > safety,
    "Core ledger safety check must run before the first full SQLite overwrite");
});
