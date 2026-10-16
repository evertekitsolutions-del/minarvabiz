import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const route = "apps/web/src/app/industries/[slug]/page.tsx";
const guideData = "apps/web/src/app/industries/industry-guides.ts";
const home = readFileSync("apps/web/src/app/page.tsx","utf8");
assert.ok(existsSync(guideData), "Public industry guide catalogue missing");
assert.ok(existsSync(route), "Public industry guide route missing");
const { industryGuides } = await import("../apps/web/src/app/industries/industry-guides.ts");
const slugs = ["retail-store","boutique-fashion","computer-electronics","service-centers","laundry-ironing","wholesale"];
assert.deepEqual(industryGuides.map(g=>g.slug), slugs, "Guides must match six homepage industries in stable order");
assert.equal(new Set(industryGuides.map(g=>g.slug)).size,6);
for(const g of industryGuides) {
  assert.ok(g.title.length>5 && g.summary.length>55, "Unique substantial summary: "+g.slug);
  assert.ok(g.subtitle.length>12);
  assert.equal(g.steps.length,4,"Four-stage actual business use-case: "+g.slug);
  assert.equal(g.capabilities.length,4,"Four business module connections: "+g.slug);
  assert.ok(g.steps.every(step=>step.title && step.body.length>35),"Real descriptions required: "+g.slug);
  assert.ok(g.capabilities.every(x=>x.title && x.description.length>35),"Specific capabilities required: "+g.slug);
  assert.ok(home.includes('slug:"'+g.slug+'"'),"Homepage industry slug must be linked: "+g.slug);
}
assert.match(home, /href=\{[^\n]*\/industries\/[^\n]*ind\.slug/,"Industry cards must have real navigation");
const page=readFileSync(route,"utf8");
assert.match(page,/generateStaticParams/);
assert.match(page,/generateMetadata/);
assert.match(page,/notFound\(\)/,"Unknown industry must be 404");
assert.match(page,/minarva-biz-mark\.svg/,"Keep existing approved logo");
assert.match(page,/href="\/login"/,"Authenticated sign-in preserved");
assert.match(page,/href="\/#industries"/,"Back link to industry selection");
assert.match(page,/releases\/tag\/v1\.0\.15/,"Do not claim unreleased Windows builds");
assert.match(page,/availability depends on edition/i,"Describe acceptance limits accurately");
assert.match(page,/Illustrative workflow/i,"Never imply sample transactions are real");
assert.doesNotMatch(page, /<script|<form[^>]*action=["']?\/signup/i);
assert.doesNotMatch(page,/Free Trial|Trusted by \d+|GST compliant/i);
console.log("Public industry guides content and navigation contract PASS");
