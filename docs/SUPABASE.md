# Supabase setup (Phase 51)

## 1. Create project
https://supabase.com → New project

## 2. Apply migrations
In Supabase SQL Editor, run in order:
1. `supabase/migrations/001_core_schema.sql`
2. `supabase/migrations/002_rls_policies.sql`

## 3. Environment
Copy `.env.example` → `apps/web/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
# Server only — never NEXT_PUBLIC_
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

## 4. Auth users
Authentication → Users → Add user (email/password).  
Optionally insert into `profiles` with role.

## 5. Verify
- Login page uses Supabase Auth when env is real
- App shell calls `hydrateStoresFromSupabase()`
- UnitOfWork uses PostgREST for customers/products/sales/orders

## Security
- Anon key only in browser
- Service role never in client bundles
- RLS requires `auth.uid()` for business tables
