import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, file) => mod._compile(
  ts.transpileModule(fs.readFileSync(file, "utf8"), {
    fileName: file,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText, file,
);
const {
  enqueueOutbox, exportOutbox, hydrateOutbox, setOutboxScope,
} = require("../outbox-bridge.ts");

function reset() {
  hydrateOutbox([]);
  setOutboxScope(null);
}
const seed = (id="seed") => ({
  ...enqueueOutbox("customers", id, "insert", { id }),
});

test("corrupt restored sequences do not poison subsequent event identity or mutate source", () => {
  reset();
  const events = [
    { ...seed("a"), sequence: NaN },
    { ...seed("b"), sequence: Infinity },
    { ...seed("c"), sequence: -3 },
    { ...seed("d"), sequence: 1.25 },
    { ...seed("e"), sequence: 17 },
  ];
  try {
    hydrateOutbox(events);
    assert.equal(enqueueOutbox("customers", "new", "insert", {}).sequence, 18);
    assert.equal(Number.isNaN(exportOutbox()[0].sequence), true);
    assert.equal(exportOutbox()[1].sequence, Infinity);
    assert.equal(events[4].sequence, 17);
  } finally {
    reset();
  }
});

test("a large restored queue can hydrate and enqueue without a variadic overflow", () => {
  reset();
  const template = seed();
  const records = Array.from({ length: 150_000 }, (_, index) => ({
    ...template, id: String(index), sequence: index + 1,
  }));
  try {
    hydrateOutbox(records);
    assert.equal(exportOutbox().length, 150_000);
    assert.equal(enqueueOutbox("customers", "next", "insert", {}).sequence, 150_001);
  } finally {
    reset();
  }
});

test("exhausted restores do not evict existing pending financial audit data", () => {
  reset();
  const before = seed("critical-sale");
  const preserved = exportOutbox().map(e => ({ ...e }));
  const overloaded = [{ ...before, sequence: Number.MAX_SAFE_INTEGER }];
  try {
    assert.throws(() => hydrateOutbox(overloaded), /sequence exhausted/);
    assert.deepEqual(exportOutbox(), preserved, "failed restore cannot replace live pending events");
    assert.equal(enqueueOutbox("payments", "after-rejected-restore", "insert", {}).sequence, 2);
  } finally {
    reset();
  }
});

test("last safe event sequence is not followed by an unsafe duplicate", () => {
  reset();
  const old = seed("original");
  try {
    hydrateOutbox([{ ...old, sequence: Number.MAX_SAFE_INTEGER - 1 }]);
    const final = enqueueOutbox("customers", "last", "insert", {});
    assert.equal(final.sequence, Number.MAX_SAFE_INTEGER);
    const before = exportOutbox().length;
    assert.throws(() => enqueueOutbox("customers", "overflow", "insert", {}), /sequence exhausted/);
    assert.equal(exportOutbox().length, before, "overflow never queues a new event");
  } finally {
    reset();
  }
});

test("malformed restore fails closed before modifying existing outbox", () => {
  reset();
  const current = seed("existing");
  try {
    assert.throws(() => hydrateOutbox([null]), /malformed event/);
    assert.equal(exportOutbox()[0].id, current.id);
  } finally {
    reset();
  }
});
