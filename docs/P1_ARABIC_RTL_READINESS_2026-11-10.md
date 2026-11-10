# P1 — Arabic RTL readiness (staged, OFF)

Scope: build a safe opt-in Arabic locale shell without modifying production English, payment forms, plan entitlements, or invoice amounts.

## In this PR
- `apps/web/src/lib/rtl-readiness.ts`: explicit `resolveUiLocale(requested, arabicRtlEnabled=false)`. Default always English/LTR.
- `apps/web/src/components/LocalePreviewFrame.tsx`: a direction-aware wrapper for future localized routes; email/SKU/invoice identifiers use a native `bdi dir="ltr"` isolate.
- `scripts/p1-arabic-rtl-readiness.test.mjs`: run `node --experimental-strip-types --test scripts/p1-arabic-rtl-readiness.test.mjs`.
- No root-layout change, no implicit locale detection, no Arabic translation claims, and no rollout activation.

## Follow-up acceptance gates
1. Select locale from authorized tenant preference and server-enforced feature flag `MINARVA_ARABIC_RTL_ENABLED=false`; never from untrusted arbitrary query values.
2. Localize every supported navigation string, labels, validation, emails, invoices/PDFs and accessibility announcements with versioned Arabic translations; fallback must be explicit and reviewable.
3. Audit CSS with inline-start/inline-end and block-start/block-end, native dir, and bidi-isolated mixed-language identifiers. Do not mirror brand marks, QR/barcodes or numeric account identifiers.
4. Native RTL e2e viewport snapshots at mobile/tablet/desktop, keyboard/focus navigation, input fields, print/PDF and Arabic numeral choices; no claims of complete support before these pass.
5. Run cross-tenant signed-JWT tests for persisted language settings and RBAC. Ensure Arabic RTL does not affect financial rounding or tax.
6. Arabic native-speaker linguistic and legal-content review before any public launch.

This draft only establishes core building blocks; it is not an Arabic-language product release.
