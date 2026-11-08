import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import { confirmRendererPersistenceBeforeUpdate } from "../apps/desktop/electron/update-persistence-barrier.ts";

function setup(respond) {
  const ipc = new EventEmitter();
  const sender = new EventEmitter();
  let destroyed = false;
  sender.isDestroyed = () => destroyed;
  sender.send = (channel, requestId) => {
    assert.equal(channel, "update:flush-request");
    respond?.({ ipc, sender, requestId });
  };
  sender.destroy = () => { destroyed = true; sender.emit("destroyed"); };
  return { ipc, sender };
}

test("pre-update waits for the same renderer's positive, correlated SQLite flush acknowledgment", async () => {
  const { ipc, sender } = setup(({ipc, sender, requestId}) => {
    queueMicrotask(() => {
      ipc.emit("update:flush-result", { sender: new EventEmitter() }, requestId, true);
      ipc.emit("update:flush-result", { sender }, "wrong-request-id", true);
      ipc.emit("update:flush-result", { sender }, requestId, true);
    });
  });
  assert.equal(await confirmRendererPersistenceBeforeUpdate(ipc, sender, 500), true);
  assert.equal(ipc.listenerCount("update:flush-result"), 0);
  assert.equal(sender.listenerCount("destroyed"), 0);
});

test("failed native SQLite flush fails closed and removes IPC listeners", async () => {
  const { ipc, sender } = setup(({ipc, sender, requestId}) => {
    queueMicrotask(() => ipc.emit("update:flush-result", { sender }, requestId, false));
  });
  assert.equal(await confirmRendererPersistenceBeforeUpdate(ipc, sender, 500), false);
  assert.equal(ipc.listenerCount("update:flush-result"), 0);
});

test("renderer without flush callback times out rather than installing", async () => {
  const { ipc, sender } = setup();
  assert.equal(await confirmRendererPersistenceBeforeUpdate(ipc, sender, 15), false);
  assert.equal(ipc.listenerCount("update:flush-result"), 0);
  assert.equal(sender.listenerCount("destroyed"), 0);
});

test("renderer destruction blocks upgrade", async () => {
  const { ipc, sender } = setup(({sender}) => queueMicrotask(() => sender.destroy()));
  assert.equal(await confirmRendererPersistenceBeforeUpdate(ipc, sender, 500), false);
  assert.equal(ipc.listenerCount("update:flush-result"), 0);
});

test("the real installer cannot spawn before the validated pre-update SQLite snapshot is durable", () => {
  const main = fs.readFileSync("apps/desktop/electron/main.ts", "utf8");
  const start = main.indexOf('ipcMain.handle("update:install"');
  const untilEnd = main.indexOf('ipcMain.handle("app:relaunch"', start);
  assert.ok(start >= 0 && untilEnd > start);
  const handler = main.slice(start, untilEnd);
  assert.ok(handler.includes('await confirmRendererPersistenceBeforeUpdate(ipcMain, event.sender)'));
  assert.ok(handler.includes('await createLocalBackup("pre-update")'));
  assert.ok(handler.includes('spawn(update.path, ["--updated", "/S", "--force-run"]'));
  assert.ok(handler.indexOf("await confirmRendererPersistenceBeforeUpdate") <
    handler.indexOf('await createLocalBackup("pre-update")'));
  assert.ok(handler.indexOf('await createLocalBackup("pre-update")') < handler.indexOf("spawn(update.path"));
  assert.ok(handler.includes("if (!backup.ok)"));
  // A 24-hour D-drive scheduler must never replace an on-demand pre-update
  // mirrored backup; both copies are validated before NSIS can start.
  assert.ok(handler.includes('const externalBackupDir = backupDestinationDir()'));
  assert.ok(handler.includes('await createLocalBackup("pre-update", externalBackupDir)'));
  assert.ok(handler.includes("if (!externalBackup.ok)"));
  assert.ok(handler.indexOf('await createLocalBackup("pre-update", externalBackupDir)') <
    handler.indexOf("spawn(update.path"));
  assert.ok(main.includes('destinationOverride ?? (kind === "automatic" ? backupDestinationDir() : backupDir())'));

  const renderer = fs.readFileSync("apps/desktop/src/App.tsx", "utf8");
  const preload = fs.readFileSync("apps/desktop/electron/preload.ts", "utf8");
  const productModal = fs.readFileSync("apps/desktop/src/components/ProductEditorModal.tsx", "utf8");
  const saveFn = renderer.slice(renderer.indexOf("async function handleSaveProduct()"),renderer.indexOf("function handleAdjustStock()"));
  assert.ok(renderer.includes("onUpdateFlushRequested"));
  assert.ok(renderer.includes("return (await persistDomainToSqlite()) === true"));
  assert.ok(preload.includes('ipcRenderer.send("update:flush-result", requestId, ok === true)'));
  assert.ok(saveFn.includes("productMutationAwaitingPersistenceRef.current"));
  assert.ok(saveFn.includes("if (!await persistProductAndRefresh())"));
  const mutation = fs.readFileSync("apps/desktop/src/lib/boutique-product-commit.ts", "utf8");
  assert.ok(saveFn.includes("commitBoutiqueProductDraft(productForm, editingProductId, variantRows)"));
  assert.ok(mutation.includes("createProductVariantFamily(payload,variants)"));
  assert.ok(saveFn.indexOf("if (!await persistProductAndRefresh())") < saveFn.indexOf("setProductOpen(false)"));
  assert.ok(productModal.includes('pendingDurability?"Retry save to disk"'));
  assert.ok(productModal.includes("disabled={saving||pendingDurability}"));
});
