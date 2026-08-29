-- Row Level Security — authenticated users; service role bypasses RLS

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE measurement_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE laundry_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper: authenticated check
CREATE OR REPLACE FUNCTION public.is_authenticated()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT auth.uid() IS NOT NULL;
$$;

-- Profiles: users read/update own row
DROP POLICY IF EXISTS profiles_select_own ON profiles;
CREATE POLICY profiles_select_own ON profiles FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS profiles_update_own ON profiles;
CREATE POLICY profiles_update_own ON profiles FOR UPDATE USING (auth.uid() = id);

-- Business tables: authenticated full access (refine per-role later via role claims)
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'branches','customers','categories','products','inventory_transactions',
    'sales','sale_items','payments','measurement_profiles','orders','order_expenses',
    'laundry_orders','expenses','purchases','suppliers','staff_members',
    'outbox_events','audit_logs'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_auth_all ON %I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_auth_all ON %I FOR ALL USING (public.is_authenticated()) WITH CHECK (public.is_authenticated())',
      t, t
    );
  END LOOP;
END $$;
