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
  formatWorkspaceMoney,
  formatWorkspaceDateTime,
} = require("../workspace-display-preferences.ts");

const india = { locale: "en-IN", timeZone: "Asia/Kolkata", currency: "INR" };
const oman = { locale: "ar-OM", timeZone: "Asia/Muscat", currency: "OMR" };

test("canonicalizes industry-neutral locale/time zone/currency", () => {
  assert.deepEqual(validateWorkspaceDisplayPreferences({ ...india, currency: "inr" }), india);
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
