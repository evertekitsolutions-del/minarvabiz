import assert from "node:assert/strict";
import { register } from "node:module";

// Use the shared source loader so coverage is measured against the same TS
// source locations as the existing printing runtime tests.
register(new URL("../../../../scripts/ts-source-test-loader.mjs", import.meta.url));

const settings = (await import("../print-settings.ts"));

settings.resetPrintTemplates();
const defaults = settings.listPrintTemplates();
assert.equal(defaults.length, 4);
for (const kind of ["invoice", "quotation"]) {
  for (const paper of ["a4", "thermal"]) {
    const group = defaults.filter((item) => item.documentKind === kind && item.paper === paper);
    assert.equal(group.length, 1);
    assert.equal(group[0].isDefault, true);
  }
}

const source = defaults.find((item) => item.documentKind === "invoice" && item.paper === "a4");
const copy = settings.duplicatePrintTemplate(source.id);
assert.ok(copy);
const saved = settings.savePrintTemplate({ ...copy, heading: "CUSTOM TAX INVOICE", footerText: "Custom footer", isDefault: true });
assert.equal(saved.heading, "CUSTOM TAX INVOICE");
assert.equal(settings.getPrintTemplate("invoice", "a4").id, saved.id);
assert.equal(settings.getPrintTemplateById(saved.id).footerText, "Custom footer");

const deleted = settings.deletePrintTemplate(saved.id);
assert.equal(deleted.ok, true);
assert.notEqual(settings.getPrintTemplate("invoice", "a4").id, saved.id);

console.log("Print templates: defaults + edit + default + duplicate + delete PASS");
