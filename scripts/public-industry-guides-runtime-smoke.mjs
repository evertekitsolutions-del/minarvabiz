import assert from "node:assert/strict";

const origin = process.env.MINARVA_WEB_SMOKE_URL || "http://127.0.0.1:3000";
const cases = [
  ["retail-store","Retail Store"],
  ["boutique-fashion","Boutique"],
  ["computer-electronics","Computer"],
  ["service-centers","Service Centers"],
  ["laundry-ironing","Laundry"],
  ["wholesale","Wholesale"],
];
for (const [slug,headline] of cases) {
  const response = await fetch(new URL("/industries/"+slug,origin), {redirect:"manual",headers:{Accept:"text/html"}});
  assert.equal(response.status,200,"Guide unavailable: "+slug);
  assert.match(response.headers.get("content-type")||"",/text\/html/);
  assert.ok(response.headers.get("content-security-policy"),"CSP missing: "+slug);
  const html=await response.text();
  for (const expected of [
    "Minarva Biz",headline,"How the work fits together",
    "Tools that support the workflow","Illustrative workflow",
    "Feature availability depends on edition","href=\"/login\"","href=\"/#industries\"",
  ]) assert.ok(html.includes(expected),"Missing industry guide "+slug+": "+expected);
  assert.doesNotMatch(html,/<form[^>]*action=["']?\/signup/i);
  console.log("Public industry guide PASS "+slug+" (HTTP 200, CSP, modules, auth link)");
}
const missing=await fetch(new URL("/industries/not-a-real-industry",origin),{redirect:"manual"});
assert.equal(missing.status,404,"Unknown industry must fail closed with HTTP 404");
console.log("Unknown public industry PASS (HTTP 404)");
