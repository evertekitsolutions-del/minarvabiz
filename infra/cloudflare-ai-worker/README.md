# Minarva Biz Free AI Worker

This Worker is the zero-cost-phase AI inference adapter for Minarva Biz. It keeps the product support API provider-neutral while using Cloudflare Workers AI during the pre-25-paying-customer phase.

## Models

- Text: `@cf/zai-org/glm-4.7-flash`
- Screenshot / vision: `@cf/google/gemma-4-26b-a4b-it`

Both are Cloudflare-hosted Workers AI models. The Worker itself never contains an API key; it uses the Workers AI binding.

## Authentication

The public `workers.dev` URL is not trusted anonymously. `POST /v1/respond` accepts only the short-lived Vercel OIDC token forwarded by the Minarva Biz server. The Worker verifies:

- RSA signature against Vercel JWKS;
- issuer;
- Minarva Biz team audience;
- exact production subject;
- team ID;
- project ID/name;
- production environment;
- expiry / not-before / issued-at claims.

The unauthenticated `GET /health` endpoint exposes only non-secret model/service metadata and does not run inference.

## Zero-cost rule

The Minarva Biz web backend does not automatically fall through to a paid AI provider. Paid fallback is disabled unless the future operator explicitly opts in with `MINARVA_ALLOW_PAID_AI_FALLBACK=true`.

Cloudflare Workers AI Free currently provides a daily free allocation. When that allocation is exhausted, AI chat fails closed to the existing Help Center / Support Inbox path rather than enabling billing.

## One-time deployment

A Cloudflare Free account is required. From this directory:

```bash
npx wrangler login
npx wrangler deploy
```

After deployment, save the resulting HTTPS Worker URL in `public.support_runtime_config` under key `ai_provider` and set `enabled=true`. No Vercel secret is required for the Worker because Vercel OIDC is used for service-to-service authentication.

## Future migration

This Worker is an adapter, not a permanent lock-in. The Minarva Biz support server reads provider routing from the private runtime-config table. A future self-hosted inference endpoint can replace the Cloudflare endpoint without changing Windows clients or the Support Center UI.
