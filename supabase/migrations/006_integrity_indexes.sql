-- Performance and integrity indexes (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_invoice_number ON sales (invoice_number) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales (customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales (sale_date);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products (sku);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products (barcode);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers (phone);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders (customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments (customer_id);
CREATE INDEX IF NOT EXISTS idx_outbox_status ON sync_queue (status) WHERE status = 'pending';

-- Ensure RLS remains enabled on core tables (no-op if already)
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'customers','products','sales','orders','payments','expenses','purchases','suppliers'
  ]
  LOOP
    EXECUTE format('ALTER TABLE IF EXISTS %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
