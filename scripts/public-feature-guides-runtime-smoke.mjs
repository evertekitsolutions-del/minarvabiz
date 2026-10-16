import assert from "node:assert/strict";
const base = process.env.MINARVA_WEB_SMOKE_URL || "http://127.0.0.1:3000";
const entries = [
  ["billing-pos","Billing & POS"],["inventory","Inventory"],["gst-accounting","GST & Accounting"],
  ["service-management","Service Management"],["tailoring","Tailoring"],["laundry","Laundry"],
  ["customers-crm","Customers & CRM"],["reports-analytics","Reports & Analytics"],
];
const home=await fetch(new URL("/",base),{redirect:"manual"});
assert.equal(home.status,200,"Homepage required for feature links");
const homeHTML=await home.text();
for(const [slug,title] of entries) {
  assert.ok(homeHTML.includes('/features/'+slug),"Homepage missing feature URL "+slug);
  const res=await fetch(new URL("/features/"+slug,base),{redirect:"manual",headers:{Accept:"text/html"}});
  assert.equal(res.status,200,"Public feature route failed "+slug);
  assert.match(res.headers.get("content-type")||"",/text\/html/i);
  assert.ok(res.headers.get("content-security-policy"),"CSP missing "+slug);
  const html=await res.text();
  const encodedTitle=title.replace(/&/g,"&amp;");
  assert.ok(html.includes(title)||html.includes(encodedTitle),"Feature "+slug+" missing heading "+title);
  for(const phrase of ["Minarva Biz","How the workflow fits together",
    "What it brings together","Illustrative workflow","Feature availability depends on edition",
    'href="/login"','href="/#features"',"releases/tag/v1.0.15"]) {
    assert.ok(html.includes(phrase),"Feature "+slug+" missing "+phrase);
  }
  assert.doesNotMatch(html,/<form[^>]*action=["']?\/signup/i);
  console.log("Product feature detail PASS "+slug+" (HTTP 200, CSP, navigation)");
}
const invalid=await fetch(new URL("/features/not-a-real-module",base),{redirect:"manual"});
assert.equal(invalid.status,404,"Unknown feature must 404, never show another customer page");
console.log("Unknown feature 404 PASS");
