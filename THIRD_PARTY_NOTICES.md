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
