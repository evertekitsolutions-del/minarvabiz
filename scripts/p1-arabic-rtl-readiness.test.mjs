import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolveUiLocale} from "../apps/web/src/lib/rtl-readiness.ts";

test("P1 Arabic opt-in never silently enables on production routes",()=>{
  assert.deepEqual(resolveUiLocale("ar"),{
    locale:"en",lang:"en",dir:"ltr",numberLocale:"en-IN",
  });
  assert.equal(resolveUiLocale("ar",false).dir,"ltr");
  assert.equal(resolveUiLocale("ar",true).dir,"rtl");
  assert.equal(resolveUiLocale("en",true).dir,"ltr");
  assert.equal(resolveUiLocale("ar-EG",true).dir,"ltr");
  assert.equal(resolveUiLocale(null,true).dir,"ltr");
});
test("P1 Arabic context is immutable and cannot mutate default locale",()=>{
  const context=resolveUiLocale("ar",true);
  assert.equal(Object.isFrozen(context),true);
  assert.equal(context.numberLocale,"ar-OM");
});
test("P1 RTL boundary sets native direction while isolating LTR identifiers",()=>{
  const frame=readFileSync("apps/web/src/components/LocalePreviewFrame.tsx","utf8");
  const layout=readFileSync("apps/web/src/app/layout.tsx","utf8");
  assert.match(frame,/resolveUiLocale\(requestedLocale, enabled\)/);
  assert.match(frame,/dir=\{context\.dir\}/);
  assert.match(frame,/lang=\{context\.lang\}/);
  assert.match(frame,/bdi lang="en" dir="ltr"/);
  assert.match(layout,/<html lang="en">/);
  assert.doesNotMatch(layout,/<html lang="ar"/);
});
