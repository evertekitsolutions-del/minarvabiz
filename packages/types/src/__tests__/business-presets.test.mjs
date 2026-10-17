import assert from "node:assert/strict";
import {
  BUSINESS_PRESET_VERSION, BUSINESS_PRESETS, getBusinessPresetById, getBusinessPresetByCode,
} from "../business-presets.ts";

assert.equal(BUSINESS_PRESET_VERSION, 1);
assert.equal(BUSINESS_PRESETS.length, 100);
assert.deepEqual(BUSINESS_PRESETS.map(p => p.id), Array.from({length: 100}, (_, i) => String(i + 1).padStart(3, "0")));
assert.equal(new Set(BUSINESS_PRESETS.map(p => p.id)).size, 100);
assert.equal(new Set(BUSINESS_PRESETS.map(p => p.code)).size, 100);
const counts = { RETAIL: 0, EXPIRE_BASED: 0, SERIALIZED: 0, DIMENSIONAL: 0, SERVICE: 0 };
for (const preset of BUSINESS_PRESETS) {
  assert.ok(Object.hasOwn(counts, preset.businessGroup), preset.code);
  counts[preset.businessGroup]++;
  assert.equal(preset.code, preset.businessGroup.toLowerCase() + "_" + preset.id);
  assert.ok(preset.name.length > 0);
  assert.equal(getBusinessPresetById(preset.id), preset);
  assert.equal(getBusinessPresetByCode(preset.code), preset);
  assert.ok(Object.isFrozen(preset));
  assert.ok(Object.isFrozen(preset.defaultAddons));
}
assert.deepEqual(counts, { RETAIL: 30, EXPIRE_BASED: 15, SERIALIZED: 15, DIMENSIONAL: 20, SERVICE: 20 });
for (const [id, expected] of [
  ["001", "FMCG / Kirana Stores"], ["031", "Medical Stores / Pharmacies"],
  ["046", "Mobile Phone & Electronic Gadget Shops"], ["054", "CCTV & Security System Integrators"],
  ["061", "Hardware & Power Tool Stores"], ["074", "Photo Framing Workshops"],
  ["081", "Hair Salons & Barber Shops"], ["084", "Mobile Phone Repair Kiosks"],
  ["085", "Computer & Laptop Service Centers"], ["100", "Bicycle & E-Bike Repair Bays"],
]) assert.equal(getBusinessPresetById(id)?.name, expected, "Name for " + id);
assert.deepEqual(getBusinessPresetByCode("serialized_054").defaultAddons, ["booking"]);
assert.deepEqual(getBusinessPresetByCode("service_085").defaultAddons, ["barcode", "serial"]);
assert.deepEqual(getBusinessPresetByCode("service_084").defaultAddons, ["barcode", "serial"]);
assert.deepEqual(getBusinessPresetByCode("serialized_055").defaultAddons, ["booking"]);
assert.equal(getBusinessPresetById("101"), undefined);
assert.equal(getBusinessPresetById("54"), undefined);
assert.equal(getBusinessPresetByCode("CCTV"), undefined);
assert.equal(getBusinessPresetByCode("__proto__"), undefined);
assert.ok(Object.isFrozen(BUSINESS_PRESETS));
assert.throws(() => { BUSINESS_PRESETS[0].name = "tampered"; }, TypeError);
assert.equal(getBusinessPresetById("001")?.name, "FMCG / Kirana Stores");
console.log("PASS UBP-01 business presets: all 100 names, codes, groups and immutable hybrid defaults");
