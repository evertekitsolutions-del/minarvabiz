import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source=readFileSync("apps/web/src/app/page.tsx","utf8");
assert.ok(!source.includes("max-w-[1320px]"),"Legacy narrow desktop container must not return");
assert.ok((source.match(/max-w-\[1720px\]/g)||[]).length>=8,"Use wide desktop containers consistently");
assert.ok(source.includes("lg:py-12"),"Reduce overlarge first-screen vertical spacing");
assert.ok(source.includes("3.35vw"),"Desktop hero heading must be compact");
assert.ok(!source.includes("5.1vw"),"Reject old oversized 76px headline");
const quick=source.indexOf('aria-label="Explore business modules"');
const features=source.indexOf('id="features"');
assert.ok(quick>=0&&features>quick,"Quick module navigation must precede feature grid");
assert.ok(source.includes('xl:grid-cols-8'),"Use eight clearly organized quick modules on desktop");
assert.ok(source.includes('features.map((item)'),"All real feature labels must appear in shortcut ribbon");
for(const name of ["workflows","features","industries","product-tour","editions","download","faq"]){
  assert.ok(source.includes('id="'+name+'"'),"Missing content section "+name);
}
for(const item of ["Get your stock ready","Create the next invoice","Keep each job moving","Review what changed","Billing and payments","Service & customer orders","Sample invoice","Sample service tracker"]){
  assert.ok(source.includes(item),"Missing detailed workflow content: "+item);
}
assert.ok(source.includes("illustrative examples")&&source.includes("not screenshots of a verified customer account"));
assert.ok(source.includes('href="/login"'),"Keep existing login");
assert.ok(source.includes("releases/tag/v1.0.15"),"Keep verified release link");
assert.doesNotMatch(source,/Trusted by [0-9]+|GST compliant|Free Trial/i,"Do not invent testimonials, regulatory status or trial");
console.log("Desktop density and detailed business workflow contract PASS");
