import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename,
);

const {
  validateWorkspaceDisplayPreferences,
  restoreWorkspaceDisplayPreferences,
  formatWorkspaceMoney,
  formatWorkspaceDateTime,
} = require("../workspace-display-preferences.ts");

const india = { locale: "en-IN", timeZone: "Asia/Kolkata", currency: "INR" };
const oman = { locale: "ar-OM", timeZone: "Asia/Muscat", currency: "OMR" };
// ICU versions may canonicalize Asia/Kolkata to its equivalent Asia/Calcutta alias.
const canonicalIndia = validateWorkspaceDisplayPreferences(india);

test("canonicalizes industry-neutral locale/time zone/currency", () => {
  assert.deepEqual(validateWorkspaceDisplayPreferences({ ...india, currency: "inr" }), {
    ...india,
    timeZone: new Intl.DateTimeFormat("en-IN", { timeZone: india.timeZone }).resolvedOptions().timeZone,
  });
  assert.deepEqual(validateWorkspaceDisplayPreferences(oman), oman);
});

test("rejects malformed or unsupported locale, currency and time zone", () => {
  for (const input of [
    { ...india, locale: "<script>" },
    { ...india, locale: "xx-INVALID-LOCALE-THAT-IS-TOO-LONG" },
    { ...india, timeZone: "../Asia/Kolkata" },
    { ...india, timeZone: "Not/A_Zone" },
    { ...india, currency: "INR<script>" },
    { ...india, currency: "1NR" },
  ]) {
    assert.throws(() => validateWorkspaceDisplayPreferences(input));
  }
});

test("formats money in configured currency without changing numeric value", () => {
  assert.match(formatWorkspaceMoney(1234.5, india), /1,234\.50/);
  assert.ok(formatWorkspaceMoney(1234.5, oman).length > 4);
  assert.throws(() => formatWorkspaceMoney(Number.POSITIVE_INFINITY, india));
});

test("formats one UTC instant in different time zones", () => {
  const timestamp = "2026-01-15T12:00:00Z";
  const inIndia = formatWorkspaceDateTime(timestamp, india);
  const inOman = formatWorkspaceDateTime(timestamp, { ...oman, locale: "en-GB" });
  assert.notEqual(inIndia, inOman);
  assert.match(inIndia, /17:30|5:30/);
  assert.match(inOman, /16:00|4:00/);
  assert.throws(() => formatWorkspaceDateTime("invalid", india));
});

test("offline restore isolates corrupt fields without discarding valid currency", () => {
  const result = restoreWorkspaceDisplayPreferences(
    { locale: "ar-OM", timeZone: "Not/A_Zone", currency: "omr" },
    india,
  );
  assert.equal(result.locale, "ar-OM");
  assert.equal(result.currency, "OMR");
  assert.equal(result.timeZone, canonicalIndia.timeZone);
});

test("offline restore safely ignores non-string and blank legacy values", () => {
  const result = restoreWorkspaceDisplayPreferences(
    { locale: 123, timeZone: "", currency: "bad-code" },
    india,
  );
  assert.deepEqual(result, canonicalIndia);
});


test("rejects three-letter non-ISO currency placeholders before persistence", () => {
  if (typeof Intl.supportedValuesOf !== "function") return;
  assert.equal(Intl.supportedValuesOf("currency").includes("ZZZ"), false);
  assert.throws(() => validateWorkspaceDisplayPreferences({ ...india, currency: "ZZZ" }), /Unsupported ISO 4217/);
  assert.deepEqual(restoreWorkspaceDisplayPreferences({ currency: "ZZZ", locale: "ar-OM" }, india), {
    ...canonicalIndia, locale: "ar-OM",
  });
});


test("rejects malformed persisted display preferences with a controlled validation error", () => {
  for (const value of [null, undefined, {}, { ...india, locale: null }, { ...india, currency: 123 }, { ...india, timeZone: [] }]) {
    assert.throws(() => validateWorkspaceDisplayPreferences(value), /Display preferences must contain string/);
  }
});

test("offline restore tolerates missing or malformed snapshots without changing defaults", () => {
  for (const snapshot of [null, undefined, 0, "corrupt", [], false]) {
    assert.deepEqual(restoreWorkspaceDisplayPreferences(snapshot, india), canonicalIndia);
  }
  assert.deepEqual(restoreWorkspaceDisplayPreferences({ locale: "ar-OM", currency: 123 }, india), {
    ...india, locale: "ar-OM",
  });
});
