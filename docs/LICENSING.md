# Licensing

## Model

- **Ed25519** signed license tokens
- Payload: plan, edition, features, expiry, activation limit, device bindings
- Client verifies with **public** key only
- Private key lives only on `license-admin` / secure issuer

## Lifecycle

`unlicensed` → `trial` → `active` → `grace` → `expired` / `invalid`

Grace days are plan-specific (see `PLAN_LIMITS` in `@minarvabiz/licensing`).

## Device binding

Desktop collects hardware fingerprint (CPU, disk, MAC, Windows product id where available).
Tokens may list allowed fingerprint hashes.

## Feature & limit enforcement

```ts
import { requireFeature, assertLimit } from "@minarvabiz/business-logic";

requireFeature("staff");
assertLimit("customers");
```

## UI

- `/license` — activate token, trial, demo plans, usage vs limits, branches
- `/settings` — hybrid sync controls + link to license
