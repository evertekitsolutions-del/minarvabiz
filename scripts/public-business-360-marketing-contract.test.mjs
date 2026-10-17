import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const get = path => readFileSync(path, "utf8");
const home = get("apps/web/src/app/page.tsx");
const solutions = get("apps/web/src/app/solutions/page.tsx");
const pricing = get("apps/web/src/app/pricing/page.tsx");
const partners = get("apps/web/src/app/partners/page.tsx");

for (const [label, href] of [["Solutions", "/solutions"], ["Pricing", "/pricing"], ["Partner with us", "/partners"]]) {
  assert.ok(home.includes('title: "'+label+'", href: "'+href+'"'), "Main and mobile navigation: "+label);
  assert.ok(home.includes('href="'+href+'"'), "Homepage link to "+label);
}
assert.match(home,/id="complete-platform"/);
for (const name of ["Billing","Accounts","CRM","Staff Management","Attendance","Online Store","Business Website","Marketing", "Service"]) {
  assert.ok(home.includes(name),"Critical master-vision area missing: "+name);
}
for (const stage of ["In development","In planning"]) assert.ok(home.includes(stage),"Future modules must have explicit readiness");

for(const mod of ["Billing & POS","Inventory & Purchases","GST & Accounting","Customers & CRM","Staff & Attendance",
  "Services & Field Operations","Business Website","Online Store / E-commerce","Marketing & Growth",
  "Reports & Management"]) {
  assert.ok(solutions.includes(mod),"Missing solution group "+mod);
}
assert.ok(solutions.includes("not yet available"),"Future e-commerce and site builder must not be advertised as shipped");
assert.ok(solutions.includes("not yet a live site builder"));
assert.ok(solutions.includes("Commerce checkout is not yet available"));

for (const [name, price] of [
  ["Starter", "₹2,299"],
  ["Business Pro", "₹4,499"],
  ["Business Web", "₹6,699"],
  ["Business 360", "₹8,899"],
]) {
  assert.ok(pricing.includes('name: "' + name + '"'), "Approved plan missing: " + name);
  assert.ok(pricing.includes('price: "' + price + '"'), "Incorrect owner-approved list price: " + name);
}
assert.match(pricing, /Custom Quote/, "Enterprise needs a negotiated quote");
assert.match(pricing, /per year \+ GST/, "Every plan is an annual price excluding GST");
assert.match(pricing, /All prices exclude GST/);
assert.match(pricing, /30-day trial with supported activation/);
assert.match(pricing, /Everything in Starter/, "Business Pro includes Starter");
assert.match(pricing, /Everything in Business Pro/, "Business Web includes Pro");
assert.match(pricing, /Everything in Business Web/, "Business 360 includes Website tier");
assert.match(pricing, /Website integration in development/);
assert.match(pricing, /E-commerce integration in development/);
assert.match(pricing, /not yet available for purchase/);
assert.match(pricing, /No checkout or payment collection is enabled on this website/);
assert.doesNotMatch(pricing, /<form[^>]*action=|\/api\/checkout|href="\/signup"/i);
const commercialPlan = get("docs/BUSINESS_360_COMMERCIAL_AND_INTEGRATION_PLAN.md");
for (const fee of ["₹2,299", "₹4,499", "₹6,699", "₹8,899"]) {
  assert.ok(commercialPlan.includes(fee), "Approved fee not recorded in plan: " + fee);
}
assert.match(commercialPlan, /Annual plan price points are owner-approved, GST excluded/);
assert.match(commercialPlan, /Do not open checkout/);
assert.match(commercialPlan, /Business Web \+ E-commerce \/ Online Store/);

assert.match(partners,/>10%<\/strong>/);
assert.match(partners,/first eligible subscription fee actually collected/);
assert.match(partners,/excluding taxes, discounts, refunds and payment processing charges/);
assert.match(partners,/30-day refund \/ verification window/);
assert.match(partners,/One-time commission on the first paid subscription only/);
assert.match(partners,/not an active or legally binding commission offer/);
assert.match(partners,/No personal information is collected by this website/);
assert.match(partners,/href=\{`mailto:/,"Partner enquiry opens a mail client, not fake automatic signup");
assert.doesNotMatch(partners,/\/api\/referrals|createPartner\(|sendPayout\(/,"No unreviewed referral tracking/payout promises");
assert.doesNotMatch(partners,/share.*api.key|service_role|sb_secret_/i,"Never expose server credentials");
console.log("Business 360 positioning, packages, truthful module stage and 10% partner policy contract PASS");
