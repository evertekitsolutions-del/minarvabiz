import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, path) => mod._compile(ts.transpileModule(fs.readFileSync(path, "utf8"), {
  fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, path);
const { createDurableDayEndController } = require("../durable-day-end.ts");
const record = { id: "close-1", businessDate: "2026-10-23" };

test("day-end close cannot report success before native SQLite acknowledgment", async () => {
  let resolveWrite;
  let mutationCount = 0;
  const controller = createDurableDayEndController(
    () => { mutationCount++; return { record }; },
    () => ({ record }),
    () => new Promise(resolve => { resolveWrite = resolve; }),
  );
  const saving = controller.close();
  assert.equal(controller.hasPending(), true);
  assert.equal(controller.isSaving(), true);
  assert.equal((await controller.close()).ok, false);
  assert.equal((await controller.reopen(record.businessDate, "reason")).ok, false);
  assert.equal(mutationCount, 1);
  resolveWrite(true);
  assert.deepEqual(await saving, { ok: true, record });
  assert.equal(controller.hasPending(), false);
});

test("failed close and reopen persist retries never apply the business mutation twice", async () => {
  let closes = 0, reopens = 0, writes = 0;
  const controller = createDurableDayEndController(
    () => { closes++; return { record }; },
    () => { reopens++; return { record: { ...record, reopenedAt: "now" } }; },
    async () => ++writes % 2 === 0,
  );
  assert.equal((await controller.close()).ok, false);
  assert.equal(controller.pendingKind(), "close");
  assert.equal((await controller.close()).ok, false);
  assert.equal((await controller.reopen(record.businessDate, "correct entry")).ok, false);
  assert.equal((await controller.retry()).ok, true);
  assert.equal(closes, 1);
  assert.equal(reopens, 0);
  assert.equal((await controller.reopen(record.businessDate, "correct entry")).ok, false);
  assert.equal(controller.pendingKind(), "reopen");
  assert.equal((await controller.retry()).ok, true);
  assert.equal(reopens, 1);
});

test("thrown native failure retains the pending day-end, not a false success", async () => {
  let mutationCount = 0;
  let writes = 0;
  const controller = createDurableDayEndController(
    () => { mutationCount++; return { record }; },
    () => ({ record }),
    async () => { if (++writes === 1) throw Error("disk full"); return true; },
  );
  const failed = await controller.close();
  assert.equal(failed.ok, false);
  assert.match(failed.error, /disk full/);
  assert.equal(controller.hasPending(), true);
  assert.equal((await controller.retry()).ok, true);
  assert.equal(mutationCount, 1);
});

test("domain rejection never creates a phantom pending day-end", async () => {
  let writes = 0;
  const controller = createDurableDayEndController(
    () => ({ record: null, error: "Day already closed" }),
    () => ({ record: null, error: "Permission denied" }),
    async () => { writes++; return true; },
  );
  assert.match((await controller.close()).error, /already closed/);
  assert.match((await controller.reopen("2026-10-23", "why")).error, /Permission denied/);
  assert.equal(controller.hasPending(), false);
  assert.equal(writes, 0);
});
