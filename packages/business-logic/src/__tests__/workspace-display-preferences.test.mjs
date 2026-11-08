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
    ...canonicalIndia, locale: "ar-OM",
  });
});


test("missing legacy timestamps never render as 1970 dates", () => {
  for (const value of [null, undefined, "", "   "]) {
    assert.throws(() => formatWorkspaceDateTime(value, india), /Invalid date\/time/);
  }
  assert.match(formatWorkspaceDateTime(0, india), /1970/);
});

test("stale profile save is rejected without mutating the hydrated business profile", () => {
  // Isolate the module to avoid touching global snapshot persistence.
  const Module = require("node:module");
  const source = fs.readFileSync(new URL("../shop-profile.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const isolated = new Module("shop-profile-test");
  isolated.filename = "shop-profile-test.js";
  isolated.paths = [];
  isolated.require = (name) => {
    if (name === "@minarvabiz/utils") return { nowISO: () => "2026-11-07T00:00:00Z" };
    if (name === "./autosave") return { touchPersistence: () => {} };
    if (name === "./workspace-display-preferences") return require("../workspace-display-preferences.ts");
    throw new Error("Unexpected dependency: " + name);
  };
  isolated._compile(compiled, isolated.filename);
  const api = isolated.exports;
  const opened = api.getShopProfile();
  api.hydrateShopProfile({ ...opened, shopName: "Current tenant", updatedAt: "2026-11-07T01:00:00Z" });
  assert.throws(() => api.updateShopProfile({ shopName: "Stale write" }, opened.updatedAt), /changed since this form was opened/);
  assert.equal(api.getShopProfile().shopName, "Current tenant");
  assert.equal(api.updateShopProfile({ shopName: "Fresh write" }, "2026-11-07T01:00:00Z").shopName, "Fresh write");
});

test("rapid profile saves advance revision and reject a same-millisecond stale editor", () => {
  const Module = require("node:module");
  const source = fs.readFileSync(new URL("../shop-profile.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const isolated = new Module("shop-profile-revision-test");
  isolated.filename = "shop-profile-revision-test.js";
  isolated.paths = [];
  isolated.require = (name) => {
    if (name === "@minarvabiz/utils") return { nowISO: () => "2026-11-07T01:00:00.000Z" };
    if (name === "./autosave") return { touchPersistence: () => {} };
    if (name === "./workspace-display-preferences") return require("../workspace-display-preferences.ts");
    throw new Error("Unexpected dependency: " + name);
  };
  isolated._compile(compiled, isolated.filename);
  const api = isolated.exports;
  api.hydrateShopProfile({ ...api.getShopProfile(), updatedAt: "2026-11-07T01:00:00.000Z" });
  const first = api.getShopProfile();
  const saved = api.updateShopProfile({ shopName: "First save" }, first.updatedAt);
  assert.ok(Date.parse(saved.updatedAt) > Date.parse(first.updatedAt));
  assert.throws(() => api.updateShopProfile({ shopName: "Stale save" }, first.updatedAt), /changed since this form was opened/);
  const second = api.updateShopProfile({ shopName: "Second save" }, saved.updatedAt);
  assert.ok(Date.parse(second.updatedAt) > Date.parse(saved.updatedAt));
  assert.equal(api.getShopProfile().shopName, "Second save");
});


test("settings UI does not claim a durable save before persistence acknowledgement", () => {
  const settings = fs.readFileSync(new URL("../../../../apps/web/src/app/(app)/settings/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(settings, /setShopMsg\\("Business profile saved"\\)/);
  assert.match(settings, /Business profile updated locally; durable save and cloud sync are not verified/);
  assert.match(settings, /Saving business settings is unavailable in this browser workspace/);
});


test("failed persistence does not acknowledge or retain an unsaved business profile", () => {
  const Module = require("node:module");
  const source = fs.readFileSync(new URL("../shop-profile.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  let reject = true;
  const isolated = new Module("shop-profile-persistence-failure-test");
  isolated.filename = "shop-profile-persistence-failure-test.js";
  isolated.paths = [];
  isolated.require = (name) => {
    if (name === "@minarvabiz/utils") return { nowISO: () => "2026-11-08T00:00:00Z" };
    if (name === "./autosave") return { touchPersistence: () => { if (reject) throw new Error("Storage unavailable"); } };
    if (name === "./workspace-display-preferences") return require("../workspace-display-preferences.ts");
    throw new Error("Unexpected dependency: " + name);
  };
  isolated._compile(compiled, isolated.filename);
  const api = isolated.exports;
  const before = api.getShopProfile();
  assert.throws(() => api.updateShopProfile({ shopName: "Unpersisted change" }, before.updatedAt), /Storage unavailable/);
  assert.deepEqual(api.getShopProfile(), before);
  reject = false;
  const saved = api.updateShopProfile({ shopName: "Retried change" }, before.updatedAt);
  assert.equal(saved.shopName, "Retried change");
  assert.notEqual(saved.updatedAt, before.updatedAt);
});


test("missing scoped snapshot clears cached business identity before tenant switch", () => {
  const Module = require("node:module");
  const source = fs.readFileSync(new URL("../shop-profile.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const isolated = new Module("shop-profile-scope-reset-test");
  isolated.filename = "shop-profile-scope-reset-test.js";
  isolated.paths = [];
  isolated.require = (name) => {
    if (name === "@minarvabiz/utils") return { nowISO: () => "2026-11-08T00:00:00Z" };
    if (name === "./autosave") return { touchPersistence: () => {} };
    if (name === "./workspace-display-preferences") return require("../workspace-display-preferences.ts");
    throw new Error("Unexpected dependency: " + name);
  };
  isolated._compile(compiled, isolated.filename);
  const api = isolated.exports;
  api.hydrateShopProfile({
    ...api.getShopProfile(), shopName: "Tenant A", legalName: "Private A",
    email: "private@example.test", currency: "OMR", locale: "ar-OM",
  });
  assert.equal(api.getShopProfile().legalName, "Private A");
  api.hydrateShopProfile(null);
  const reset = api.getShopProfile();
  assert.equal(reset.shopName, "Minarva Biz");
  assert.equal(reset.legalName, "");
  assert.equal(reset.email, "");
  assert.equal(reset.currency, "INR");
  api.hydrateShopProfile({ ...reset, shopName: "Tenant B" });
  assert.equal(api.getShopProfile().shopName, "Tenant B");
  assert.equal(api.getShopProfile().legalName, "");
});


test("durable desktop persistence requires a committed asynchronous acknowledgement", async () => {
  const Module = require("node:module");
  const source = fs.readFileSync(new URL("../autosave.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const isolated = new Module("autosave-ack-test");
  isolated.filename = "autosave-ack-test.js";
  isolated.paths = [];
  isolated.require = (name) => {
    if (name === "./runtime-mode") return { isProductionMode: () => true };
    throw new Error("Unexpected dependency: " + name);
  };
  isolated._compile(compiled, isolated.filename);
  const { awaitDesktopPersistence } = isolated.exports;
  const previousWindow = globalThis.window;
  try {
    delete globalThis.window;
    await assert.rejects(awaitDesktopPersistence(), /authenticated desktop host/);
    globalThis.window = {};
    await assert.rejects(awaitDesktopPersistence(), /No durable desktop persistence adapter/);
    globalThis.window.__minarvaDesktopPersist = () => undefined;
    await assert.rejects(awaitDesktopPersistence(), /did not return a durable-write acknowledgement/);
    let commit;
    globalThis.window.__minarvaDesktopPersist = () => new Promise((resolve) => { commit = resolve; });
    let acknowledged = false;
    const pending = awaitDesktopPersistence().then(() => { acknowledged = true; });
    await Promise.resolve();
    assert.equal(acknowledged, false);
    commit();
    await pending;
    assert.equal(acknowledged, true);
    globalThis.window.__minarvaDesktopPersist = () => Promise.reject(new Error("SQLite commit failed"));
    await assert.rejects(awaitDesktopPersistence(), /SQLite commit failed/);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
