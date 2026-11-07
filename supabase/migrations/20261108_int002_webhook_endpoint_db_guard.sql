-- INT-002: defense in depth for service-role writes that bypass the TypeScript policy.
-- No network dispatch is enabled by this migration.
-- NOT VALID avoids rejecting historical rows at migration time; new and updated
-- subscriptions are constrained immediately. Validate after an explicit data audit.
alter table public.integration_webhook_subscriptions
  add constraint integration_webhook_subscriptions_https_endpoint
  check (
    endpoint ~ '^https://[^/?#@[:space:]]+(:[0-9]{1,5})?(/[^#[:space:]]*)?(\\?[^#[:space:]]*)?$'
    and endpoint !~ '[@#[:space:]]'
    and length(endpoint) <= 2048
  ) not valid;
