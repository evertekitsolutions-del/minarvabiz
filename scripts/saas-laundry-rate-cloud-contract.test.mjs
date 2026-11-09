import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  LAUNDRY_DONOR_SERVICE_PRESETS, laundryDonorPreset,
} from "../packages/business-logic/src/laundry-donor-service-presets.ts";

test("MIT Laundry Lo donor services provide finite validated garment packages", () => {
  assert.equal(LAUNDRY_DONOR_SERVICE_PRESETS.length, 4);
  assert.deepEqual(LAUNDRY_DONOR_SERVICE_PRESETS.map(row => row.id),
    ["wash-fold", "wash-iron", "dry-cleaning", "premium-care"]);
  assert.equal(laundryDonorPreset("dry-cleaning")?.serviceCode, "dry_clean");
  assert.equal(laundryDonorPreset("invalid"), null);
  for (const row of LAUNDRY_DONOR_SERVICE_PRESETS) {
    assert.ok(Number.isFinite(row.startingPriceINR) && row.startingPriceINR >= 0);
    assert.ok(Number.isSafeInteger(row.defaultTatHours) && row.defaultTatHours > 0);
  }
});

test("online service tariffs require tenant-scoped RLS cloud receipt and version", () => {
  const sql = readFileSync("supabase/migrations/20261109_saas_laundry_service_rate_cards.sql", "utf8");
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /FOR SELECT TO authenticated/);
  assert.match(sql, /FOR INSERT TO authenticated/);
  assert.match(sql, /FOR UPDATE TO authenticated/);
  assert.match(sql, /user_has_org_role\(org_id/);
  assert.match(sql, /branch\.org_id = org_id/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS laundry_rate_cards_scoped_key/);
  assert.doesNotMatch(sql, /GRANT.*DELETE.*authenticated/);

  const service = readFileSync("apps/web/src/lib/online-laundry-rate-save.ts", "utf8");
  assert.match(service, /await resolveOnlineAuthorization\(/);
  assert.match(service, /getOutboxScope\(\) !== auth\.orgId/);
  assert.match(service, /await pgInsert<Row>\(/);
  assert.match(service, /await pgUpdate<Row>\(/);
  assert.match(service, /const readback = await pgSelect<Row>\(/);
  assert.match(service, /equalRow\(confirmed, fields/);
  assert.match(service, /getSessionToken\(\) !== token/);
  assert.match(service, /hydrateLaundryRateCards\(/);
});

test("actual laundry screen uses cloud adapter and refuses unverified orders", () => {
  const page = readFileSync("apps/web/src/app/(app)/laundry/page.tsx", "utf8");
  const form = readFileSync("packages/ui/src/components/laundry/LaundryForm.tsx", "utf8");
  assert.match(page, /onSaveRateOnline=\{saveLaundryRateOnline\}/);
  assert.match(page, /loadLaundryRateCardsOnline\(\)/);
  assert.match(page, /Online laundry order submission is blocked until an atomic Supabase receipt/);
  assert.match(form, /LAUNDRY_DONOR_SERVICE_PRESETS/);
  assert.match(form, /await onSaveRateOnline\(/);
  assert.match(form, /Rate confirmed in Supabase PostgreSQL/);
  assert.doesNotMatch(form, /Rate saved locally with backups/);
});
