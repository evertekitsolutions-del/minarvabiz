-- Security repair for verified P1 QA #767 (online SaaS only).
-- Client-side inventory movement history is append-only; reversals require new
-- audited movements, never mutable/deletable historic transactions.
DROP POLICY IF EXISTS inventory_transactions_role_delete ON public.inventory_transactions;
DROP POLICY IF EXISTS inventory_transactions_role_update ON public.inventory_transactions;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.inventory_transactions FROM anon, authenticated;

-- PostgreSQL TRUNCATE bypasses RLS. Do not give public API roles a bypass
-- capability on any public table, including future ordinary/partitioned tables.
DO $security$
DECLARE
  v_relation text;
BEGIN
  FOR v_relation IN
    SELECT format('%I.%I', n.nspname, c.relname)
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('REVOKE TRUNCATE ON TABLE %s FROM anon, authenticated', v_relation);
  END LOOP;
END
$security$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE ON TABLES FROM anon, authenticated;
