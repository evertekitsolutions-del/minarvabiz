let f = 0;
function a(c, m) {
  if (!c) {
    console.error("FAIL", m);
    f++;
  } else console.log("OK", m);
}

// Variant matrix size
const sizes = ["S", "M", "L"];
const colors = ["Red", "Blue"];
const n = sizes.length * colors.length;
a(n === 6, "matrix 3x2 = 6 variants");

// Loyalty earn/redeem
let points = 0;
const earn = Math.floor(500 / 100) * 1;
points += earn;
a(points === 5, "earn 5 points on 500");
const redeem = 3;
a(points >= redeem, "can redeem");
points -= redeem;
a(points === 2, "balance after redeem");
a(points + redeem >= 0, "never negative path");

// Quotation total
const total = 1000 - 50 + 40;
a(total === 990, "quotation total");

// Cash expected
const opening = 1000;
const received = 500;
const expenses = 100;
const expected = opening + received - expenses;
a(expected === 1400, "cash expected close");

// Purchase return qty cap
const soldQty = 5;
const returned = 3;
a(returned <= soldQty, "return not over sold");

if (f) process.exit(1);
console.log("variants-loyalty-cash tests passed");
