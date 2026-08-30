# Minarva Biz — Final source audit notes

This archive has been hardened for the identified source-level security and persistence issues.

## Fixed in this audit

- Tenant RLS no longer treats `org_id IS NULL` as accessible.
- Organization membership cannot be self-created through the public policy.
- All major sync pull tables are included in the cloud adapter.
- Permission state no longer defaults to `admin`; unauthenticated state has no permissions.
- Session establishment synchronizes the business-layer role.
- Production/local login no longer ships a predictable default password; first-run administrator setup is explicit.
- Offline auth metadata is persisted separately from business data.
- Production online data source fails clearly when Supabase is not configured instead of silently using memory.
- Desktop installations receive a persistent per-install device ID for outbox/sync identity.
- Outbox events are included in the persisted domain snapshot so offline sync work survives restart.
- Desktop SQLite schema version advanced to 4.

## External validation still required

- Apply migrations 001 → 003 to the real Supabase project and backfill `org_id` for existing records.
- Perform live tenant-isolation/RLS tests using two different users/organizations.
- Build and install the Windows `.exe` and test restart/upgrade/backup/restore.
- Perform a real offline → online hybrid sync against the customer's Supabase project.
- Generate production Ed25519 keys outside Git and configure the public key in clients.
- Test the actual thermal printer hardware through the Windows print path.
