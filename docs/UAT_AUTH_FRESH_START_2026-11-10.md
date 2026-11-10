# Owner emergency UAT Fresh Start — 2026-11-10

## Live Supabase purge (executed, committed, verified)
Project `wmjgefbaliuwmaxyzxkq`. All 90 operational/public data tables were truncated with RESTART IDENTITY and the 1 Auth user deleted. Post-purge exhaustive per-table counts: zero. Auth sessions and identities: zero. Organizations, branches, products, categories, sales, leads, trials and all tenant-specific records: zero.

**Preserved intentionally:** schema, applied migrations, 4 annual plan definitions, license/license administration operational records and secure edge credentials, to avoid breaking subscription pricing, offline licenses and registration infrastructure. The `private.bootstrap_new_user()` AFTER INSERT trigger remains enabled and will automatically create tenant/profile/branch when a new Auth user is inserted. Never call this trigger function manually.

## Production redirect source patch
- Browser signup sends `https://minarvabiz.com/register/complete` for production.
- Password reset sends `https://minarvabiz.com/reset-password` for production.
- Preview Workers/www origins also canonicalize to `https://minarvabiz.com`.
- Local dev can retain localhost only when NODE_ENV is not production.
- Existing `/auth/confirm` callback checks Supabase verification; no email verification bypass.

## Mandatory *external* Supabase Auth configuration — not mutable with current connected Supabase tools
In [Supabase Dashboard → Authentication → URL Configuration](https://supabase.com/dashboard/project/wmjgefbaliuwmaxyzxkq/auth/url-configuration):
1. **Site URL:** `https://minarvabiz.com`
2. **Redirect URLs:** `https://minarvabiz.com/**`, `https://www.minarvabiz.com/**` (optionally explicit `/register/complete`, `/auth/confirm` and `/reset-password` paths if wildcard matching is disabled).
3. **Remove production-obsolete** `http://localhost:3000/**` and `http://localhost:3000` allowlist entries.
4. Ensure email templates generate links with `{{ .ConfirmationURL }}` / a correctly built production link, **not** hardcoded localhost or legacy `{{ .SiteURL }}` pointing to localhost.
5. Configure production custom SMTP with a verified sender/domain before claiming external customer deliverability.

**Important:** Changing React code or Cloudflare Worker DOES NOT update Supabase GoTrue's project-level SITE_URL/allowlist. The URL Configuration is a Supabase management-plane setting, not a database row and not editable via SQL. It must be changed through an authorized Supabase Dashboard or authenticated Management API operation. Until verified, do not claim all emailed links point away from localhost.

## Owner manual acceptance
From a fresh session on `https://minarvabiz.com/register`, register a never-seen email. Inspect Supabase `auth.users` for a new user, new org and new branch; follow a verification email delivered by properly configured SMTP; complete the initial 30-day trial. Independently test `/forgot-password` and inspect actual clicked callback URL: it must resolve to `https://minarvabiz.com/reset-password`, not `localhost`. Confirm no old QA tenant IDs remain. Do not create live-money transactions during UAT.
