let failed = 0;
function assert(c, m) {
  if (!c) {
    console.error("FAIL", m);
    failed++;
  } else console.log("OK", m);
}

// Simulate outbox idempotency: same aggregate id not double-applied by tracking
const applied = new Set();
function applyEvent(ev) {
  const key = `${ev.aggregateType}:${ev.aggregateId}:${ev.sequence}`;
  if (applied.has(key)) return false;
  applied.add(key);
  return true;
}

const e1 = { aggregateType: "sales", aggregateId: "s1", sequence: 1 };
const e2 = { aggregateType: "sales", aggregateId: "s1", sequence: 1 };
assert(applyEvent(e1) === true, "first apply");
assert(applyEvent(e2) === false, "idempotent skip duplicate");

// Financial conflict: never auto-overwrite
function resolveFinancial(localVer, remoteVer) {
  if (localVer !== remoteVer) return "manual";
  return "ok";
}
assert(resolveFinancial(1, 2) === "manual", "financial conflict manual");

if (failed) process.exit(1);
console.log("outbox sync tests passed");
