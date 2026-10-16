import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const path = "apps/web/src/app/";
const dataPath = path+"features/feature-guides.ts";
const routePath = path+"features/[slug]/page.tsx";
const home = readFileSync(path+"page.tsx", "utf8");
assert.ok(existsSync(dataPath), "Expected eight feature-specific guide descriptions");
assert.ok(existsSync(routePath), "Expected public feature-detail route");
const { featureGuides, findFeatureGuide } = await import("../apps/web/src/app/features/feature-guides.ts");

const expectedSlugs = [
  "billing-pos", "inventory", "gst-accounting", "service-management",
  "tailoring", "laundry", "customers-crm", "reports-analytics"
];
assert.deepEqual(featureGuides.map(item=>item.slug), expectedSlugs);
assert.equal(new Set(featureGuides.map(item=>item.slug)).size,8, "All module URLs must be unique");
assert.equal(findFeatureGuide("invalid-feature"),undefined,"Unknown modules are not valid");
for (const guide of featureGuides) {
  assert.equal(findFeatureGuide(guide.slug),guide,"Feature lookup must preserve identity");
  assert.ok(guide.title.length>=6 && guide.summary.length>65, "Meaningful page description "+guide.slug);
  assert.ok(guide.eyebrow.length>4 && guide.headline.length>15);
  assert.equal(guide.steps.length,4,"Daily workflow must show four stages "+guide.slug);
  assert.equal(guide.benefits.length,4,"Must show four module capabilities "+guide.slug);
  assert.ok(guide.steps.every(x=>x.title && x.detail.length>35));
  assert.ok(guide.benefits.every(x=>x.title && x.detail.length>35));
  assert.ok(home.includes('slug:"'+guide.slug+'"'), "Homepage card missing feature slug "+guide.slug);
}
assert.match(home,/href=\{"\/features\/"\+f\.slug\}/,"Feature cards must open their own page");
assert.match(home,/href=\{"\/features\/"\+item\.slug\}/,"Hero shortcut row must open individual pages");
const detail = readFileSync(routePath,"utf8");
for(const token of ["generateStaticParams","generateMetadata","notFound()","href=\"/login\"","href=\"/#features\"","minarva-biz-mark.svg","Illustrative workflow","availability depends on edition","releases/tag/v1.0.15"]) {
  assert.ok(detail.toLowerCase().includes(token.toLowerCase()),"Missing feature detail safety/navigation: "+token);
}
assert.doesNotMatch(detail,/Free Trial|Trusted by [0-9]+|GST compliant/i);
console.log("Eight public module detail guides contract PASS");
