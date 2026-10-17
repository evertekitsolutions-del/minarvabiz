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

for(const name of ["Starter","Business Pro","Business 360","Enterprise & Custom Integrations"]) {
  assert.ok(pricing.includes(name),"Package missing: "+name);
}
assert.match(pricing,/Pricing to be confirmed/);
assert.match(pricing,/not yet available for purchase/);
assert.doesNotMatch(pricing,/₹\s*[0-9]/,"Unapproved prices must not be published");
assert.doesNotMatch(pricing,/<form[^>]*action=|\/api\/checkout|href="\/signup"/i);

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
