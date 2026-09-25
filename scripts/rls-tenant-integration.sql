\set ON_ERROR_STOP on

-- Minimal Supabase-compatible PostgreSQL harness for executing the real tenant RLS migrations.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;

CREATE SCHEMA auth;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.organization_members (
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  role text NOT NULL,
  PRIMARY KEY (org_id, user_id)
);
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY organization_members_self_select ON public.organization_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  full_name text NOT NULL,
  role text NOT NULL DEFAULT 'admin',
  branch_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.products (
  id uuid PRIMARY KEY,
  org_id uuid REFERENCES public.organizations(id),
  label text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.sales (
  id uuid PRIMARY KEY,
  org_id uuid REFERENCES public.organizations(id),
  label text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.customers (
  id uuid PRIMARY KEY,
  org_id uuid REFERENCES public.organizations(id),
  label text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.products, public.sales, public.customers TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;

-- Legacy permissive policies must be removed by the current hardening migration.
CREATE POLICY products_auth_all ON public.products
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY sales_auth_all ON public.sales
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY customers_auth_all ON public.customers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.organizations(id, name) VALUES
  ('10000000-0000-0000-0000-000000000001', 'Tenant A'),
  ('20000000-0000-0000-0000-000000000002', 'Tenant B');

INSERT INTO auth.users(id, email) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'admin-a@example.test'),
  ('a0000000-0000-0000-0000-000000000002', 'cashier-a@example.test'),
  ('a0000000-0000-0000-0000-000000000003', 'tailor-a@example.test'),
  ('b0000000-0000-0000-0000-000000000001', 'admin-b@example.test');

INSERT INTO public.profiles(id, full_name, role) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Admin A', 'admin'),
  ('a0000000-0000-0000-0000-000000000002', 'Cashier A', 'cashier'),
  ('a0000000-0000-0000-0000-000000000003', 'Tailor A', 'tailor'),
  ('b0000000-0000-0000-0000-000000000001', 'Admin B', 'admin');

INSERT INTO public.organization_members(org_id, user_id, role) VALUES
  ('10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'admin'),
  ('10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'cashier'),
  ('10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'tailor'),
  ('20000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'admin');

INSERT INTO public.products(id, org_id, label) VALUES
  ('11000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'A product'),
  ('22000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'B product');

\i supabase/migrations/20260916_tenant_bootstrap_and_org_defaults.sql
\i supabase/migrations/20260925_tenant_org_helper_uuid_fix.sql
\i supabase/migrations/20260919_tenant_policy_alignment.sql
\i supabase/migrations/20260924_security_rls_role_auth_hardening.sql

CREATE SCHEMA test;
CREATE FUNCTION test.assert_true(condition boolean, message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT COALESCE(condition, false) THEN
    RAISE EXCEPTION 'ASSERTION FAILED: %', message;
  END IF;
END;
$$;

CREATE FUNCTION test.expect_rls_denial(command text, message text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  BEGIN
    EXECUTE command;
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLSTATE = '42501' THEN
        RETURN;
      END IF;
      RAISE;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: expected RLS/privilege denial: %', message;
END;
$$;

GRANT USAGE ON SCHEMA test TO authenticated;
GRANT EXECUTE ON FUNCTION test.assert_true(boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION test.expect_rls_denial(text, text) TO authenticated;

SELECT test.assert_true(
  NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND policyname LIKE '%_auth_all'
  ),
  'legacy *_auth_all policies must be absent after hardening'
);

-- Admin A: reads only tenant A, implicit org trigger assigns tenant A, explicit tenant B insert is denied.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);
SELECT test.assert_true((SELECT count(*) FROM public.products) = 1, 'Admin A must see only Tenant A products');

INSERT INTO public.products(id, label)
VALUES ('11000000-0000-0000-0000-000000000011', 'A implicit product');

SELECT test.expect_rls_denial(
  $$INSERT INTO public.products(id, org_id, label)
    VALUES ('11000000-0000-0000-0000-000000000012',
            '20000000-0000-0000-0000-000000000002',
            'cross tenant')$$,
  'Admin A must not insert into Tenant B'
);

UPDATE public.products
SET label = 'attempted cross-tenant update'
WHERE id = '22000000-0000-0000-0000-000000000002';

RESET ROLE;
SELECT test.assert_true(
  (SELECT org_id FROM public.products WHERE id = '11000000-0000-0000-0000-000000000011')
    = '10000000-0000-0000-0000-000000000001'::uuid,
  'insert trigger must assign Admin A sole organization'
);
SELECT test.assert_true(
  (SELECT label FROM public.products WHERE id = '22000000-0000-0000-0000-000000000002') = 'B product',
  'Tenant A update must not mutate Tenant B row'
);

-- Cashier A: tenant reads are allowed; inventory/admin writes are denied; sales writes are allowed.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', false);
SELECT test.assert_true((SELECT count(*) FROM public.products) = 2, 'Cashier A must see Tenant A products');
SELECT test.expect_rls_denial(
  $$INSERT INTO public.products(id, label)
    VALUES ('11000000-0000-0000-0000-000000000021', 'cashier product')$$,
  'Cashier must not write admin/inventory tables'
);
INSERT INTO public.sales(id, label)
VALUES ('13000000-0000-0000-0000-000000000001', 'cashier sale');
RESET ROLE;

SELECT test.assert_true(
  (SELECT org_id FROM public.sales WHERE id = '13000000-0000-0000-0000-000000000001')
    = '10000000-0000-0000-0000-000000000001'::uuid,
  'cashier sale must be scoped to Tenant A'
);

-- Tailor A: customer writes are allowed; sales writes are not.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000003', false);
INSERT INTO public.customers(id, label)
VALUES ('14000000-0000-0000-0000-000000000001', 'tailor customer');
SELECT test.expect_rls_denial(
  $$INSERT INTO public.sales(id, label)
    VALUES ('13000000-0000-0000-0000-000000000002', 'tailor sale')$$,
  'Tailor must not write sales'
);
RESET ROLE;

-- Admin B sees only Tenant B even after Tenant A created additional rows.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'b0000000-0000-0000-0000-000000000001', false);
SELECT test.assert_true((SELECT count(*) FROM public.products) = 1, 'Admin B must see only Tenant B product');
SELECT test.assert_true(
  (SELECT label FROM public.products LIMIT 1) = 'B product',
  'Admin B must not receive Tenant A product data'
);
RESET ROLE;

SELECT 'PostgreSQL RLS tenant-isolation integration PASS' AS result;
