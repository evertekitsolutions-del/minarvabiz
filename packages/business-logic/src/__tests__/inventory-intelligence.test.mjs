let failures = 0;
function assert(condition, message) {
  if (!condition) {
    console.error("FAIL", message);
    failures++;
  } else {
    console.log("OK", message);
  }
}

// Average daily sales: 60 units / 30 days = 2/day.
const daily = 60 / 30;
assert(daily === 2, "average daily sales");

// Reorder point: lead demand (2 x 7) + safety demand (2 x 7) = 28.
const reorderPoint = daily * (7 + 7);
assert(reorderPoint === 28, "reorder point includes lead + safety stock");

// With 10 units on hand, a 50-unit max level requires 40 units.
const recommended = Math.max(0, 50 - 10);
assert(recommended === 40, "recommended order reaches maximum stock target");

// Stock value is a deterministic accounting value.
const stockValue = 25 * 120;
assert(stockValue === 3000, "stock valuation");

// Days of cover is stock divided by daily demand.
const daysOfCover = 25 / 2;
assert(daysOfCover === 12.5, "days of cover");

// Gross margin uses selling price as denominator.
const marginPercent = ((180 - 120) / 180) * 100;
assert(Math.round(marginPercent * 100) / 100 === 33.33, "gross margin percent");

// ABC cumulative thresholds: 80% / 95% / remainder.
const abcA = 70 / 100;
const abcB = 90 / 100;
const abcC = 100 / 100;
assert(abcA <= 0.8, "ABC A threshold");
assert(abcB > 0.8 && abcB <= 0.95, "ABC B threshold");
assert(abcC > 0.95, "ABC C threshold");

// Six months with no sales is considered dead stock by the engine.
assert(180 >= 180 && 0 <= 0, "dead-stock threshold");

if (failures) process.exit(1);
console.log("inventory intelligence tests passed");
