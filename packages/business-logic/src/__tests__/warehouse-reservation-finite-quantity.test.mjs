import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../warehouse-store.ts", import.meta.url), "utf8");

const reserveStart = source.indexOf("export function reserveWarehouseStock");
const releaseStart = source.indexOf("export function releaseWarehouseReservation");
const transferStart = source.indexOf("export function createWarehouseTransfer");
assert.ok(reserveStart >= 0 && releaseStart > reserveStart && transferStart > releaseStart);

const reserveBlock = source.slice(reserveStart, releaseStart);
const releaseBlock = source.slice(releaseStart, transferStart);

assert.match(reserveBlock, /!Number\.isFinite\(qty\) \|\| qty <= 0/);
assert.match(reserveBlock, /finite number greater than zero/);
assert.match(releaseBlock, /const qty = roundQty\(input\.quantity\)/);
assert.match(releaseBlock, /!Number\.isFinite\(qty\) \|\| qty <= 0/);
assert.match(releaseBlock, /return \{ \.\.\.position \}/);
assert.match(releaseBlock, /position\.reserved - qty/);

console.log("WMS reservation finite-quantity contract tests passed");
