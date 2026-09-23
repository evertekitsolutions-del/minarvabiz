import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../warehouse-store.ts", import.meta.url), "utf8");

const inferStart = source.indexOf("function inferTransferSequence");
const nextStart = source.indexOf("function nextTransferNumber");
const hydrateStart = source.indexOf("export function hydrateWarehouseState");
const exportStart = source.indexOf("export function exportWarehouseState");
assert.ok(nextStart >= 0, "nextTransferNumber must exist");
assert.ok(inferStart > nextStart, "transfer-sequence inference must be defined near transfer numbering");
assert.ok(hydrateStart > inferStart, "hydrateWarehouseState must exist after transfer-sequence inference");
assert.ok(exportStart > hydrateStart, "exportWarehouseState must follow hydration");

const inferBlock = source.slice(inferStart, hydrateStart);
const hydrateBlock = source.slice(hydrateStart, exportStart);

assert.match(inferBlock, /\^WTR-\\d\{8\}-\(\\d\+\)\$/);
assert.match(inferBlock, /Number\.parseInt/);
assert.match(inferBlock, /Number\.isSafeInteger\(sequence\)/);
assert.match(hydrateBlock, /Math\.max\(explicitSequence, inferTransferSequence\(transfers\)\)/);
assert.match(hydrateBlock, /Number\.isFinite\(input\.transferSequence\)/);

console.log("WMS transfer sequence hydration contract tests passed");
