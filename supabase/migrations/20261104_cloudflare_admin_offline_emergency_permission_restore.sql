-- Restore Cloudflare emergency-admin access after refreshing the offline activation RPC.
-- The dual-authority boundary in 20261005_cloudflare_admin_dual_authority.sql
-- requires BOTH the private Worker edge-secret proof and a live emergency session.
-- Direct anonymous callers without those proofs fail closed in cloudflare_admin_me().
GRANT EXECUTE ON FUNCTION public.cloudflare_admin_prepare_offline_activation(TEXT, TEXT)
  TO anon;
