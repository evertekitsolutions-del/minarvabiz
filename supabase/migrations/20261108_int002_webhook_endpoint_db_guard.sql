-- INT-002: service-role defense in depth. This is NOT a DNS/SSRF-safe dispatcher.
-- NOT VALID constrains all new/updated rows without assuming historical data is clean.
-- Existing rows require an explicit audit before VALIDATE CONSTRAINT.
alter table public.integration_webhook_subscriptions
  add constraint integration_webhook_subscriptions_https_endpoint
  check (
    endpoint ~ '^https://[^/?#@[:space:]]+'
    and endpoint !~ '[@#[:space:]]'
    and length(endpoint) <= 2048
    -- A hostname must have at least two DNS labels. Block literal IPv4/IPv6,
    -- local/reserved suffixes and invalid port syntax even for service-role writes.
    and split_part(split_part(substring(endpoint from 9), '/', 1), '?', 1)
        ~ '^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(:[0-9]{1,5})?$'
    and endpoint !~* '^https://([^. /?:]+\.)*(localhost|local|internal|test|invalid|example|onion|arpa)(:[0-9]+)?([/?]|$)'
    and endpoint !~ '^https://[0-9]+(\.[0-9]+){3}(:[0-9]+)?([/?]|$)'
  ) not valid;
