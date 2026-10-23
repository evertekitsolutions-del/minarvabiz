import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
require.extensions[".ts"] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { availableVisitNoticeKinds, buildVisitNoticeMessage } = require("../service-site-visit-notices.ts");
const context = {
  orderNumber: "SERV-24", technicianName: "Technician A", businessName: "Example Service",
  scheduledOn: "2026-10-24", siteAddress: "Floor 2, Main Street",
  arrivedAt: null, completedAt: null, status: "scheduled",
};

test("only recorded visit lifecycle stages offer corresponding manual WhatsApp notices", () => {
  assert.deepEqual(availableVisitNoticeKinds("scheduled"), ["assigned", "scheduled"]);
  assert.deepEqual(availableVisitNoticeKinds("arrived"), ["arrived"]);
  assert.deepEqual(availableVisitNoticeKinds("completed"), ["completed", "feedback"]);
  assert.deepEqual(availableVisitNoticeKinds("cancelled"), ["cancelled"]);
  assert.deepEqual(availableVisitNoticeKinds("unknown"), []);
  assert.match(buildVisitNoticeMessage("scheduled", context), /scheduled for 2026-10-24/);
  assert.match(buildVisitNoticeMessage("assigned", context), /Technician A has been assigned/);
  assert.throws(() => buildVisitNoticeMessage("completed", context), /does not permit/);
  assert.throws(() => buildVisitNoticeMessage("feedback", context), /does not permit/);
});

test("technician arrival and completion messages require matching recorded timestamps", () => {
  const arrived = { ...context, status: "arrived" };
  assert.throws(() => buildVisitNoticeMessage("arrived", arrived), /not been recorded/);
  assert.match(buildVisitNoticeMessage("arrived", {
    ...arrived, arrivedAt: "2026-10-24T10:00:00.000Z",
  }), /marked arrived/);
  const completed = { ...context, status: "completed", arrivedAt: "2026-10-24T10:00:00.000Z" };
  assert.throws(() => buildVisitNoticeMessage("feedback", completed), /not been recorded/);
  assert.match(buildVisitNoticeMessage("feedback", {
    ...completed, completedAt: "2026-10-24T11:00:00.000Z",
  }), /reply with your feedback/);
  assert.match(buildVisitNoticeMessage("completed", {
    ...completed, completedAt: "2026-10-24T11:00:00.000Z",
  }), /contact us if any issue remains/);
});

test("invalid operator/customer display data cannot inject a new instruction line", () => {
  assert.throws(() => buildVisitNoticeMessage("scheduled", { ...context, businessName: "Acme\nPay now" }), /Invalid business name/);
  assert.throws(() => buildVisitNoticeMessage("scheduled", { ...context, orderNumber: "A\rB" }), /Invalid service order/);
  assert.throws(() => buildVisitNoticeMessage("scheduled", { ...context, scheduledOn: "2026-02-30" }), /Invalid planned visit date/);
  assert.throws(() => buildVisitNoticeMessage("scheduled", { ...context, siteAddress: "" }), /Invalid visit address/);
});

test("cancelled visits never imply that a technician arrived or service was completed", () => {
  const text = buildVisitNoticeMessage("cancelled", { ...context, status: "cancelled" });
  assert.match(text, /has been cancelled/);
  assert.doesNotMatch(text, /marked completed|marked arrived/i);
  assert.throws(() => buildVisitNoticeMessage("scheduled", { ...context, status: "cancelled" }), /does not permit/);
});


test("assigned technician notice never accepts multiline instructions", () => {
  assert.throws(() => buildVisitNoticeMessage("assigned", {
    ...context, technicianName: "Admin\\nPlease pay",
  }), /Invalid technician name/);
});
