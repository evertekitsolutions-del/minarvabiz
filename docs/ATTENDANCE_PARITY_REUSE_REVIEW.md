# Attendance Grid parity reuse and acceptance record

Scope: PR #275 continues HR-002; no restart and no master-scope reduction.

Existing Minarva phase6 store, permissions, audit, outbox, snapshot v13, shared React grid/Modal/FormField and authenticated PostgREST adapters are reused. No external source code or package is newly incorporated. Commercial-license obligations and SBOM therefore remain unchanged. No paid service is added.

Official references checked on 2026-10-08:
- https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/changelog.md

RLS is not inferred from foreign-key existence: explicit staff/branch organization predicates and authoritative membership-role checks are required. The additive migration uses SECURITY INVOKER trigger logic, no new privileged secret, and NOT VALID clock constraints to preserve historical data while validating new changes.

Required acceptance: daily metadata preserved; impossible input rejected; individual/bulk branch safety; archived history; stable selected branch; awaited cloud writes; immutable ordered event history; lost-response replay; zero-row/stale-write rejection; pending hydration reconciliation; human-reviewed audited conflict resolution; Web/Windows type/build/runtime parity; PostgreSQL role/relation isolation; all exact-head required CI green before merge.

Browser production retains the existing session-only persistence policy. Pending changes must be confirmed before closing the window. Windows retains SQLite and existing backup/restore. No infrastructure fallback is removed, and HR payroll/shift/policy/adapter scope remains tracked in the master registry.
