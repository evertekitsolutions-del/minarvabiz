import assert from "node:assert/strict";
import fs from "node:fs";
import { isDashboardCreateIntent } from "../dashboard-quick-create.ts";

for (const query of ["?action=new", "action=new", "?action=new&from=dashboard"]) {
  assert.equal(isDashboardCreateIntent(query), true, query);
}
for (const query of ["", "?", "?action=edit", "?action=New", "?action=new&action=delete", "?action=delete&action=new", "?action="]) {
  assert.equal(isDashboardCreateIntent(query), false, query);
}

const readPage = (page) =>
  fs.readFileSync(new URL("../../app/(app)/" + page + "/page.tsx", import.meta.url), "utf8");

const dashboard = readPage("dashboard");
const expected = [
  ["order", "/services", "services", /setForm\(emptyOrderForm\(\)\);\s*setCreateOpen\(true\)/],
  ["laundry", "/laundry", "laundry", /setMode\("outsourced"\)/],
  ["expense", "/expenses", "expenses", /setTab\("expenses"\);[\s\S]{0,150}setExpOpen\(true\)/],
  ["purchase", "/purchases", "purchases", /setOpen\(true\)/],
  ["customer", "/customers", "customers", /openCreate\(\)/],
];
for (const [id, href, page, opening] of expected) {
  assert.match(dashboard, new RegExp('id: "' + id + '".*?href: "' + href.replaceAll("/", "\\/") + '\\?action=new"'));
  const source = readPage(page);
  assert.match(source, /isDashboardCreateIntent\(window\.location\.search\)/, page + " must check the deep link after hydration");
  assert.match(source, opening, page + " must open its existing create UI");
}
assert.match(dashboard, /id: "sale"[\s\S]*?href: "\/sales"/, "POS New Sale remains immediately available");
assert.match(dashboard, /id: "reports"[\s\S]*?href: "\/reports"/, "Reports remains ordinary navigation");
assert.match(dashboard, /id: "sms"[\s\S]*?href: "\/notifications"/, "Notifications remains ordinary navigation");
console.log("Dashboard direct-create links, exact action parsing and existing modal wiring PASS");
