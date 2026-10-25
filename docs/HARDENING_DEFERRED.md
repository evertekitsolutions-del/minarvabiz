# Phase H — Deferred hardening register

Owner sequencing decision: [OWNER_DIRECTIVE_2026-10-20.md](OWNER_DIRECTIVE_2026-10-20.md). Record non-blocking findings here in one line and return to feature delivery. Do not treat this as removed scope. Critical proven customer data-loss/security issues, new-work CI regressions and direct implementation blockers are the exceptions.

| Area | Deferred work / boundary | Trigger to resume |
| --- | --- | --- |
| A-FIRST-CUSTOMER | Further opening-balance/cent-guard validation, backup/restore polish, installer/release-gate repetition and optional customer-flow hardening; preserve all merged protections | Phase H, or proven active-customer data-loss/security blocker |
| A-SYNC-V2 | Additional outbox, device fence, retry, conflict/recovery and branch-sync edge-case hardening not required by an in-flight new feature | Phase H, or directly blocking a new capability |
| Existing modules | Optional performance tuning, security polish, repeated audits and docs-only progress reports | Phase H, unless a documented blocking exception applies |

Append future observations as one-line entries: `YYYY-MM-DD | ID/area | verified issue/location | reason deferred`.
