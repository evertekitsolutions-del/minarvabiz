/**
 * Smoke checks for pure business-logic (Node, no browser).
 * Run: node scripts/smoke.mjs
 */
console.log("Minarva Biz smoke — pure function checks");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
function allocate(total, paid) {
  const p = Math.min(Math.max(paid, 0), total);
  return {
    paid: p,
    balance: round2(total - p),
    status: p >= total ? "completed" : p > 0 ? "partial" : "draft",
  };
}

const a = allocate(1000, 400);
assert(a.balance === 600 && a.status === "partial", "allocate partial");
const b = allocate(1000, 1000);
assert(b.balance === 0 && b.status === "completed", "allocate complete");

console.log("OK — smoke passed");
