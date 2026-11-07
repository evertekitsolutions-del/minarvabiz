-- INT-002: service-role defense in depth; not a DNS/SSRF-safe dispatcher.
-- NOT VALID constrains new/updated rows; audit historical rows before validation.
alter table public.integration_webhook_subscriptions
  add constraint integration_webhook_subscriptions_https_endpoint
  check (
    endpoint ~ '^https://[^/?#@[:space:]]+'
    and endpoint !~ '[@#[:space:]]'
    and length(endpoint) <= 2048
    -- Require DNS labels, optionally a numeric port; reject literal IPs.
    and split_part(split_part(substring(endpoint from 9), '/', 1), '?', 1)
        ~ '^[A-Za-z0-9-]+([.][A-Za-z0-9-]+)+(:[0-9]{1,5})?$'
    and endpoint !~* '^https://([^. /?:]+[.])*(localhost|local|internal|test|invalid|example|onion|arpa)(:[0-9]+)?([/?]|$)'
    and endpoint !~ '^https://[0-9]+([.][0-9]+){3}(:[0-9]+)?([/?]|$)'
  ) not valid;
