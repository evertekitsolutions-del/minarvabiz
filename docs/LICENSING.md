# MINARVA BIZ — Licensing Architecture

## Plans
Trial · Basic · Professional · Business · Enterprise

## Token
Ed25519 signed payload: license_id, customer_id, edition, plan, features, expiry, activation_limit, device_bindings

## Offline
Local signature validation + configurable grace period after last online check.
Warnings at 30/15/7/3/1 days before expiry.
Customer can always export data.

## Admin
Separate apps/license-admin for create, activate, revoke, transfer, history.
