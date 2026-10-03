# Minarva Biz — Full-Scope Engineering and Safe Reuse Policy

**Status:** Authoritative engineering policy  
**Last updated:** 2026-10-03

## 1. No scope reduction by default

Once a capability is accepted into the Minarva Biz roadmap, implementation difficulty is not a reason to silently reduce, remove, downgrade or replace that capability with a permanently simplified version.

Allowed:

- implement the capability through multiple small milestones;
- temporarily keep an incomplete branch unmerged while solving blockers;
- use feature flags during safe rollout;
- defer a capability only when the roadmap explicitly changes.

Not allowed:

- mark a partial mock/demo as complete;
- remove agreed edge cases to make tests pass;
- replace a full feature with a weaker permanent substitute without an explicit product decision;
- disable a difficult path and call the milestone finished;
- drop Offline, Online, Hybrid, multi-branch, security, audit or self-host requirements merely because they are harder to implement.

**Small milestone means sequencing, not reduced final scope.**

## 2. Root-cause-first rule

When a blocker appears:

1. reproduce and verify the actual failure;
2. identify the root cause;
3. preserve previously working behavior;
4. fix the cause rather than hiding the symptom;
5. add/adjust regression tests;
6. rerun the relevant production/security/runtime gates;
7. merge only after the required checks are green.

Workarounds are acceptable only when they are explicitly temporary, tracked and do not weaken correctness or security.

## 3. Reuse-first engineering

Before writing a substantial feature from scratch, inspect whether a reliable implementation already exists in:

- official product/vendor SDKs;
- official GitHub repositories;
- mature open-source libraries;
- framework/package registries;
- standards/reference implementations;
- well-maintained infrastructure projects;
- existing code already present in the Minarva Biz repository.

Reuse is preferred when it reduces risk, development time or maintenance burden **without reducing required product capability**.

## 4. License-safe code reuse

Code being publicly visible on GitHub does not automatically mean it can be copied into Minarva Biz.

Before copying or adapting third-party code, record and verify:

- repository/project name;
- upstream URL;
- exact release/tag/commit used;
- license;
- copyright/notice obligations;
- whether commercial use is allowed;
- whether modification/distribution obligations apply;
- whether the license is compatible with Minarva Biz's intended distribution model.

Preferred reuse sources are normally permissively licensed projects such as MIT, Apache-2.0 or BSD-style projects when technically suitable.

Copyleft licenses such as GPL/AGPL are not automatically forbidden, but their obligations must be deliberately reviewed before integrating code into a proprietary/commercial distribution path.

Code with no clear license must not be copied into the product.

## 5. No proprietary competitor copying

Research may benchmark capabilities, workflows, documented behavior and public standards from competitors such as Vyapar, QuickBooks, Zoho, Odoo, Shopify, Square and Xero.

Do not copy:

- proprietary source code;
- reverse-engineered private code;
- protected branding;
- proprietary UI assets;
- licensed commercial templates/resources without permission.

Build Minarva-native implementations of useful capabilities.

## 6. Dependency acceptance checklist

A new dependency or reused codebase must be evaluated for:

- feature completeness relative to the Minarva requirement;
- active maintenance;
- release cadence;
- known security issues;
- package provenance;
- platform support;
- Offline/Online/Hybrid compatibility;
- Windows/Web/Mobile implications;
- multi-tenant/multi-branch safety;
- performance;
- data portability;
- self-host migration path;
- vendor lock-in;
- recurring cost;
- license obligations;
- update strategy;
- testability.

A dependency that forces a permanent capability downgrade should be rejected or wrapped/replaced.

## 7. Supply-chain and attribution requirements

For reused third-party code/dependencies:

- pin or control versions appropriately;
- retain required LICENSE/NOTICE/attribution;
- include dependency metadata in SBOM/security scans where applicable;
- avoid unreviewed binary blobs;
- avoid abandoned/unverified packages for sensitive paths;
- verify checksums/signatures when relevant;
- track upstream security updates.

## 8. Build-vs-reuse decision order

Use this order:

1. existing Minarva Biz shared code;
2. official SDK/reference implementation;
3. mature open-source library with compatible license;
4. well-maintained open-source application/module that can be safely adapted;
5. custom implementation.

Custom code is appropriate when available libraries are incomplete, unsafe, locked to the wrong provider, incompatible with local-first/self-host requirements or impose unacceptable licensing obligations.

## 9. Completion standard

A feature may be reported as complete only when the agreed scope is actually implemented and verified.

Depending on the capability, acceptance may include:

- functional behavior;
- input validation;
- error handling;
- security/RBAC/RLS;
- audit history;
- Online behavior;
- Offline behavior;
- Hybrid sync behavior;
- multi-branch behavior;
- migration/backup behavior;
- updater/release compatibility;
- accessibility/responsive behavior;
- performance;
- automated tests;
- installed-app/browser UAT;
- production configuration;
- documentation.

A green unit test alone is not enough when the feature requires broader runtime verification.

## 10. No hidden feature deletion during refactor

Refactors, architecture migrations, provider changes and self-host moves must preserve user-visible behavior unless a product decision explicitly changes it.

Before replacing an implementation:

- map existing behaviors;
- preserve API/data contracts where required;
- add compatibility tests;
- migrate data safely;
- verify rollback/recovery.

## 11. Research-before-build rule

For substantial capabilities, especially infrastructure, sync, accounting, AI, commerce, domains, payments, HR/payroll, manufacturing and integrations:

1. inspect current official documentation;
2. inspect reliable open-source implementations/packages;
3. compare licenses and maintenance;
4. identify reusable components;
5. document what is reused versus custom-built;
6. then implement.

This is intended to avoid spending time recreating mature components while still protecting portability and product quality.

## 12. Relationship to the small-milestone process

The repository still uses small milestones:

**live state -> research -> branch -> implement -> test -> PR -> all required gates green -> merge -> continuation update**

This process divides work into reviewable units. It does **not** authorize reducing the final capability.

If a full feature needs 20 milestones, complete the 20 milestones rather than shipping a permanently reduced version.

## 13. Priority rule when requirements conflict

Unless safety, law or an explicit user/product decision requires otherwise:

1. preserve agreed feature scope;
2. preserve correctness/data integrity;
3. preserve security/privacy;
4. preserve Online/Offline/Hybrid architecture;
5. preserve portability/self-hostability;
6. optimize speed/cost/developer convenience after the above.

## 14. Durable record

Whenever a major reusable external component is adopted, add a short record to the relevant architecture/dependency documentation describing:

- what was reused;
- upstream source/version;
- license;
- why it was selected;
- Minarva-specific changes;
- replacement/migration path.

This keeps future chats and maintainers from accidentally replacing or removing required behavior.
