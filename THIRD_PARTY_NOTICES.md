# Third-Party Notices

Minarva Biz is proprietary software, but it depends on third-party software that
remains subject to its own licenses. The proprietary notice in `LICENSE` does
not replace, restrict, or relicense those third-party terms.

## Current dependency compliance source of truth

The release pipeline generates two machine-readable artifacts from the locked
dependency graph:

- `artifacts/minarvabiz.cdx.json` — CycloneDX SBOM.
- `artifacts/dependency-licenses.json` — resolved package/license inventory.

The **SBOM + Dependency License Policy** workflow must pass for every release.
The workflow blocks denied or unknown dependency licenses and requires an
explicit reviewed-package rationale for licenses that need manual review.

The committed policy is
`security/dependency-license-policy.json`. Because dependencies can change,
this file is a repository-level declaration and process document rather than a
static substitute for the per-build inventory.

## Explicitly reviewed dependency class

The current locked graph contains prebuilt libvips packages used by `sharp`
that declare **LGPL-3.0-or-later**. They are explicitly reviewed in the
dependency-license policy rather than silently treated as permissive software.

Before distributing a build that actually contains an LGPL component, the
release owner must preserve the applicable notices and satisfy the LGPL terms
for that distributed artifact, including any source/relinking obligations that
apply to the way the component is packaged. Platform-specific packages that are
not shipped in a target build should not be represented as shipped components.

## Release notice rule

For each commercial release:

1. use the exact SBOM and license inventory produced from that release commit;
2. retain copyright and license notices required by shipped third-party
   components;
3. include any required license text/source-offer/relinking information in the
   customer distribution package;
4. do not describe third-party components as owned by Evertek IT Solutions;
5. do not ship a dependency whose license gate is denied, unknown, or awaiting
   required review.

See `docs/COMPLIANCE.md` for the release compliance checklist.

## Optional Cloudflare customer web build toolchain

The existing Next.js customer app can also be built for Workers with
`@opennextjs/cloudflare` **1.20.12** (MIT, upstream
https://github.com/opennextjs/opennextjs-cloudflare) and Wrangler **4.151.0**
(MIT OR Apache-2.0, upstream https://github.com/cloudflare/workers-sdk).
Next.js **15.5.28** is pinned to meet this adapter's published peer range.
These are build/deployment tools; standard Next.js self-hosting is retained.
No paid storage, AI model or Cloudflare service is provisioned by installation.
Exact transitive versions and integrity hashes are recorded in pnpm-lock.yaml.

## Open Mercato — adapted amount validation

Source: https://github.com/open-mercato/open-mercato/blob/4374c48def1654927805c4b760f0e7f8648280f2/packages/core/src/modules/catalog/lib/priceValidation.ts

Adapted in `packages/business-logic/src/service-order-price-draft.ts`.
No Open Mercato runtime, enterprise package, database or service is bundled.

MIT License

Copyright (c) 2025-2026 Open Mercato contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Open Mercato — verbatim MIT locale-number and unit-code helpers

Two self-contained TypeScript helpers from Open Mercato (commit `eb3193df03b9ce0b196be417fe265c1dc47c0868`) are included verbatim (with an attribution comment) under `packages/business-logic/src/vendor/open-mercato/`:

- https://github.com/open-mercato/open-mercato/blob/eb3193df03b9ce0b196be417fe265c1dc47c0868/packages/shared/src/lib/number.ts
- https://github.com/open-mercato/open-mercato/blob/eb3193df03b9ce0b196be417fe265c1dc47c0868/packages/shared/src/lib/units/unitCodes.ts

Copyright (c) 2025-2026 Open Mercato contributors. Licensed under MIT; the full MIT license text and granted rights are reproduced in the preceding Open Mercato section of this notices file. No Open Mercato runtime, SaaS or enterprise packages are used. The Minarva adapter enforces domain-specific restrictions before RFQ preview. Licensed original code remains MIT rather than Minarva proprietary.

## Open Mercato — adapted MIT GS1 GTIN validator

Adapted Open Mercato Core catalog GTIN source at upstream commit `eb3193df03b9ce0b196be417fe265c1dc47c0868`:
https://github.com/open-mercato/open-mercato/blob/eb3193df03b9ce0b196be417fe265c1dc47c0868/packages/core/src/modules/catalog/lib/gtin.ts

Local copy: `packages/business-logic/src/vendor/open-mercato/gtin.ts` (only the upstream type import changed to a self-contained `CatalogGtinType` union). Copyright (c) 2025-2026 Open Mercato contributors. Original code and its adaptations remain covered by the upstream MIT license; the complete MIT grant and disclaimer are printed in the preceding Open Mercato section. This assistant makes no claims of GS1 number ownership or registered allocation and performs no product writes.

## Open Mercato — MIT WMS expiry-date calculation

Open Mercato upstream MIT Core: https://github.com/open-mercato/open-mercato/blob/eb3193df03b9ce0b196be417fe265c1dc47c0868/packages/core/src/modules/wms/lib/expiry.ts

Copied verbatim with an attribution header into `packages/business-logic/src/vendor/open-mercato/expiry.ts`. Copyright (c) 2025-2026 Open Mercato contributors. Full MIT copyright notice, permission grant and disclaimer are reproduced above in the Open Mercato license text section of this file. The proprietary Minarva offline batch-expiry register uses the upstream `startOfUtcDay`, `addUtcDays`, and `EXPIRING_SOON_DAYS` helpers. It does not import upstream cloud framework, Enterprise code, or bundled database/stock modules.

## ics text formatting (vendored)

- Upstream: https://github.com/adamgibbons/ics
- Commit: `be80affe735f1c97d2c5e2801a9a4f826ff4b631` (package version 3.12.1).
- Reused file: `src/utils/format-text.js`, adapted to TypeScript and lone-CR normalization in `packages/business-logic/src/vendor/ics/format-text.ts`.
- License: ISC; full copyright and permission notice retained in adjacent `LICENSE`.
- Only this dependency-free text formatter is copied. Calendar selection, all-day serialization and UTF-8 byte folding are Minarva code. No upstream dependencies, network service, calendar account or recurring fee.

ISC License (ISC)
Copyright (c) 2016, Adam Gibbons <adam.d.gibbons@gmail.com>

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
