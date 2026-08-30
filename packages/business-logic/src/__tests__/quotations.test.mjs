function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
let f = 0;
function a(c, m) {
  if (!c) {
    console.error("FAIL", m);
    f++;
  } else console.log("OK", m);
}
const lines = [{ qty: 2, price: 500 }, { qty: 1, price: 200 }];
const linesSum = lines.reduce((s, l) => s + l.qty * l.price, 0);
const material = 100;
const labour = 50;
const subtotal = linesSum + material + labour;
const discount = 50;
const tax = 60;
const total = round2(subtotal - discount + tax);
const advance = 200;
const balance = round2(total - advance);
a(linesSum === 1200, "lines sum");
a(subtotal === 1350, "subtotal with material labour");
a(total === 1360, "total after discount tax");
a(balance === 1160, "balance");
if (f) process.exit(1);
console.log("quotation tests passed");
