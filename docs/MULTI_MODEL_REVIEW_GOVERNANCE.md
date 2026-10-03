# Minarva Biz — Multi-Model Review and Innovation Governance

**Status:** Authoritative engineering/product review policy  
**Last updated:** 2026-10-03

## 1. Purpose

Minarva Biz should use multiple independent review perspectives where practical, without turning development into an uncontrolled AI voting system.

The goal is to improve:

- architecture quality;
- security;
- correctness;
- test coverage;
- product innovation;
- competitor-gap detection;
- portability/self-host readiness;
- maintainability;
- performance.

The final product/merge decision remains with the primary Minarva engineering decision process, grounded in repository evidence, tests, security checks and the authoritative product documents.

## 2. Reviewer roles

### Primary implementation/review owner
The primary engineering assistant/session is responsible for:

- live-state verification;
- implementation plan;
- code changes;
- integration decisions;
- test strategy;
- final adjudication;
- merge decision.

### Secondary AI reviewers
When available, independent reviewers may include:

- Claude/Anthropic;
- Codex Security;
- Superpowers;
- future approved code/architecture/security reviewers.

Secondary reviewers are advisory. Their findings must be verified against the actual repository, runtime behavior, tests, documentation and security model.

### Automated reviewers
Mandatory automated evidence remains the highest-confidence repeatable gate:

- CI;
- SAST;
- dependency security;
- secret scan;
- SBOM/license policy;
- coverage ratchet;
- Cloudflare live smoke;
- Windows feature-click smoke;
- Windows deep installed smoke;
- staging security/performance;
- licensing smoke;
- release audit.

## 3. No AI majority voting

Two or more AI reviewers agreeing does not make a finding correct.

Every material finding must be classified as:

- verified defect;
- verified architectural risk;
- useful improvement;
- speculative concern;
- invalid finding.

Final resolution must reference concrete code, logs, tests, docs, runtime evidence or a documented product decision.

## 4. Structured reviewer packet

For major milestones, reviewers should receive the same bounded context:

1. authoritative product goal;
2. current main SHA;
3. relevant files/diff;
4. constraints from:
   - MASTER_PRODUCT_PLAN;
   - CAPABILITY_REGISTRY;
   - AI_CAPABILITY_REGISTRY;
   - ENGINEERING_REUSE_POLICY;
   - PROJECT_CONTINUATION;
5. acceptance criteria;
6. required Online/Offline/Hybrid behavior;
7. multi-branch implications;
8. security/RBAC/RLS implications;
9. self-host portability requirements;
10. cost constraints;
11. current test results.

This prevents reviewers from proposing feature reductions that conflict with the product plan.

## 5. Required review lenses

Substantial milestones should be reviewed through these lenses:

### Architecture
- shared-core fit;
- modularity;
- coupling;
- provider lock-in;
- self-host path;
- migration/rollback.

### Data integrity
- accounting invariants;
- inventory invariants;
- idempotency;
- transaction boundaries;
- concurrency;
- conflict handling;
- backup/restore.

### Security
- authentication;
- authorization;
- tenant isolation;
- RLS;
- secrets;
- supply chain;
- audit trail;
- abuse/rate limiting.

### Offline / Sync
- offline behavior;
- outbox/retry;
- replay safety;
- version conflicts;
- branch/warehouse ownership;
- stale-state visibility.

### UX
- operational simplicity;
- failure messages;
- responsive/accessibility behavior;
- safe defaults;
- recovery paths.

### Commercial / Product
- plan/entitlement impact;
- customer self-service;
- support implications;
- competitor parity;
- differentiated value.

### AI
- AI assistance opportunity;
- agent/tool opportunity;
- approval boundary;
- hallucination/fallback behavior;
- privacy;
- provider portability;
- cost.

## 6. Innovation review

For every major product phase, independent reviewers may propose ideas under three buckets:

### Must-have
Capabilities needed for parity, correctness, compliance or customer viability.

### Differentiators
Capabilities that can make Minarva materially better than existing SMB platforms.

### Frontier ideas
Novel capabilities worth validating through research/prototype before committing them to the permanent roadmap.

Ideas are not automatically accepted. Before adding them to the Capability Registry, evaluate:

- user value;
- overlap with existing scope;
- engineering complexity;
- recurring cost;
- privacy/security;
- regulatory risk;
- Offline/Online/Hybrid impact;
- multi-branch behavior;
- portability/self-host path;
- dependency/license obligations.

## 7. External code review rule

When a reviewer recommends existing code/library/project:

1. locate the original upstream source;
2. inspect the exact license;
3. check maintenance/release activity;
4. check security advisories;
5. evaluate commercial-use obligations;
6. evaluate portability and vendor lock-in;
7. prefer official SDK/reference implementations first;
8. record adopted upstream/version/license in repo docs when materially reused.

No reviewer may justify copying proprietary competitor code or unlicensed GitHub code.

## 8. Access and least privilege

External AI reviewers should receive only the access required to review effectively.

Default policy:

- repository read access is sufficient for architecture/code review;
- write access is not required for ordinary review;
- production secrets are never shared with reviewers;
- production database write access is never granted merely for review;
- production mutations remain through the normal controlled tool/process;
- reviewer-generated patches must still pass the same PR/test/security gates.

A user's request for broad review access does not override secret/data minimization.

## 9. Claude-specific policy

When an official Claude/Anthropic connector becomes available and is connected by the user:

- use Claude as an independent architecture/code/product reviewer on substantial milestones;
- ask it to challenge assumptions, find missing edge cases and propose improvements;
- do not treat Claude output as authoritative;
- do not share secrets;
- do not let Claude directly bypass branch/PR/test/merge policy;
- any Claude-suggested change must be verified and implemented through normal Minarva workflow.

If no connector is available, development continues with existing automated gates and available independent reviewers.

## 10. Final decision rule

The final engineering decision must optimize, in order:

1. agreed product scope;
2. correctness/data integrity;
3. security/privacy;
4. Online/Offline/Hybrid behavior;
5. multi-branch correctness;
6. portability/self-hostability;
7. test/runtime evidence;
8. maintainability;
9. performance;
10. cost/developer convenience.

Reviewer preference never outranks these constraints.

## 11. Merge rule

A milestone may merge only when:

- acceptance criteria are satisfied;
- required review findings are resolved or explicitly dispositioned;
- automated gates required for that change are green;
- no known critical security/data-integrity blocker remains;
- no agreed feature was silently removed or downgraded;
- continuation/docs are updated when the authoritative next step changes.

## 12. Future review automation

Target future pipeline:

```text
Implementer
   |
Static/Unit/Integration Tests
   |
Security + Dependency + License Gates
   |
Independent AI Reviewers
   |
Runtime / Installed-App / Live-Smoke Verification
   |
Finding Reconciliation
   |
Final Minarva Decision
   |
Merge
```

This process should eventually be automated through provider-neutral review adapters so Claude, OpenAI/Codex and other approved models can be added or replaced without changing the core engineering workflow.


## 13. Verified Anthropic GitHub Action integration

For Claude independent PR review, the approved initial integration is Anthropic's official GitHub Action:

- upstream: `anthropics/claude-code-action`
- license: MIT
- pinned commit: `cfc3eb22bfed5c26ef66e3223c982af27e4524de`
- authentication input: `CLAUDE_CODE_OAUTH_TOKEN`
- repository workflow: `.github/workflows/claude-independent-review.yml`
- reviewer instructions: `CLAUDE.md`

The action pin was inspected before adoption. Do not replace it with a floating tag without repeating the supply-chain review.

The workflow deliberately:

- grants repository contents read only;
- grants Actions read only;
- grants PR/issues read only;
- has no contents write and no merge authority;
- runs only for non-draft same-repository pull requests;
- cancels stale in-progress reviews for the same PR;
- keeps full Claude output disabled;
- uses the GitHub Step Summary for review output rather than granting comment-write access;
- remains disabled unless repository variable `CLAUDE_REVIEW_ENABLED=true`;
- requires GitHub secret `CLAUDE_CODE_OAUTH_TOKEN`.

This is intentionally less than unrestricted access. Broad production/database/cloud-secret access is unnecessary for code/architecture review and would violate least-privilege review policy.

### Activation requirement

The repository connector used by ChatGPT cannot create or read GitHub Actions secrets. The user/repository administrator must add the OAuth token through GitHub's normal encrypted Actions Secrets UI, then enable the repository variable. The token must never be pasted into chat, committed to the repository or printed in workflow logs.

No paid Anthropic API key is introduced by this workflow. If the user's Claude plan/OAuth route is unavailable, leave the reviewer disabled and continue with normal deterministic gates.
