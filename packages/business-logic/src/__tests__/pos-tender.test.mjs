/**
 * Advanced POS tender contract.
 * Mirrors the shared sales tender rules so CI catches regressions in cash change
 * and split-payment settlement without requiring a browser.
 */
function roundMoney(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function validateTender(total, splits) {
  const payable = roundMoney(Math.max(0, total));
  const normalized = splits
    .map((split) => ({ ...split, amount: roundMoney(Number(split.amount) || 0) }))
    .filter((split) => split.amount !== 0);
  const errors = [];
  for (const split of normalized) {
    if (split.amount < 0) errors.push(`${split.method}: payment amount cannot be negative`);
  }
  const positive = normalized.filter((split) => split.amount > 0);
  const tendered = roundMoney(positive.reduce((sum, split) => sum + split.amount, 0));
  const cashTendered = roundMoney(positive.filter((split) => split.method === "cash").reduce((sum, split) => sum + split.amount, 0));
  const collectible = roundMoney(Math.min(payable, tendered));
  const balanceDue = roundMoney(Math.max(0, payable - tendered));
  const changeDue = roundMoney(Math.max(0, tendered - payable));
  if (changeDue > 0 && cashTendered < changeDue) {
    errors.push("Overpayment must be covered by cash so the excess can be returned as change");
  }
  return { tendered, collectible, balanceDue, changeDue, cashTendered, errors };
}

let failed = 0;
function assert(condition, message) {
  if (!condition) {
    console.error("FAIL:", message);
    failed += 1;
  } else {
    console.log("OK:", message);
  }
}

let r = validateTender(100, [{ method: "cash", amount: 120 }]);
assert(r.collectible === 100 && r.changeDue === 20 && r.errors.length === 0, "cash over-tender returns change");

r = validateTender(100, [{ method: "card", amount: 120 }]);
assert(r.errors.length === 1, "non-cash over-tender is rejected");

r = validateTender(100, [{ method: "card", amount: 80 }, { method: "cash", amount: 50 }]);
assert(r.collectible === 100 && r.changeDue === 30 && r.errors.length === 0, "split tender allows cash-covered change");

r = validateTender(100, [{ method: "card", amount: 110 }, { method: "cash", amount: 10 }]);
assert(r.errors.length === 1, "split over-tender is rejected when cash cannot cover change");

r = validateTender(100, [{ method: "upi", amount: 40 }, { method: "cash", amount: 10 }]);
assert(r.collectible === 50 && r.balanceDue === 50 && r.changeDue === 0, "partial split payment preserves balance");

r = validateTender(100, [{ method: "cash", amount: -5 }]);
assert(r.errors.length === 1, "negative tenders are rejected");

if (failed) process.exit(1);
console.log("\nAdvanced POS tender tests passed");
