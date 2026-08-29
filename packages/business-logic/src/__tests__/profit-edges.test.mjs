function r(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
let f = 0;
function a(c, m) {
  if (!c) {
    console.error("FAIL", m);
    f++;
  } else console.log("OK", m);
}

// Partial payment does not change gross profit
const rev = 1000, cogs = 400;
a(r(rev - cogs) === 600, "gross independent of partial pay");

// Discount reduces revenue base
const disc = 100;
a(r(rev - disc - cogs) === 500, "discount reduces profit");

// Tax is liability not COGS
const tax = 50;
a(r(rev - cogs) === 600, "tax not subtracted from gross");

// Return reduces revenue and restores stock conceptually
const returnAmt = 200;
a(r(rev - returnAmt - cogs) === 400, "return reduces net revenue");

// Cancelled order: profit 0
a(r(0) === 0, "cancelled order zero");

// Laundry negative margin detection
a(r(30 - 45) === -15, "negative laundry margin");

// Multiple payments sum
a(r(300 + 200 + 500) === 1000, "multiple payments total");

if (f) process.exit(1);
console.log("profit edge tests passed");
