# Independent AI Review Governance

**Status:** Prepared; activation requires explicit Anthropic authentication in GitHub.  
**Last updated:** 2026-10-03

## Purpose

Minarva Biz uses a second AI reviewer to challenge implementation decisions, inspect CI evidence, identify security/test gaps, surface reusable code/libraries and propose useful innovation. The second reviewer is advisory; it cannot replace deterministic tests, security gates or the primary architecture decision process.

## Reviewer roles

### Primary reviewer / decision authority
The primary Minarva development workflow:

- owns architecture and final merge decisions;
- verifies live GitHub state;
- evaluates all automated tests and security checks;
- accepts or rejects independent AI findings;
- resolves disagreements using code, tests, standards, product scope and security evidence.

### Claude independent reviewer
Claude:

- reviews PR diffs and related repository context;
- reads GitHub Actions results when enabled;
- challenges assumptions;
- searches the repository context for reuse opportunities;
- proposes innovative product/architecture ideas;
- leaves one structured PR review comment;
- has no merge authority.

## Permission model

Initial permission set is deliberately read-oriented:

- repository contents: read;
- GitHub Actions results: read;
- pull requests/issues: read;
- no repository or PR/issue write permission;
- no deployment/cloud/database credentials;
- no production secrets;
- no merge approval.

This prevents the reviewer from silently changing implementation while still allowing meaningful review.

## Activation

The workflow is committed but gated by repository variable:

`CLAUDE_REVIEW_ENABLED=true`

Authentication must be configured separately in GitHub. Preferred first option under the current cost policy:

`CLAUDE_CODE_OAUTH_TOKEN`

Anthropic documents that Claude Pro/Max users can create such a token using Claude Code. If that is not available, do **not** switch to paid API usage without explicit cost approval.

The current workflow intentionally does not require or contain an Anthropic API key.

## Supply-chain policy

The official Anthropic action is:

`anthropics/claude-code-action`

It was inspected from Anthropic's public GitHub repository and is MIT licensed. The workflow pins an exact reviewed commit SHA rather than a floating tag.

Pinned reviewed commit:

`cfc3eb22bfed5c26ef66e3223c982af27e4524de`

Before periodically updating this pin:

1. inspect release/source changes;
2. re-check license;
3. review permissions/action inputs;
4. run normal security/secret/license gates.

## Review protocol for each PR

When enabled:

1. deterministic CI/security tests run as normal;
2. Claude reads the diff, project master docs and CI results;
3. Claude posts its structured findings;
4. the primary workflow reads those findings;
5. accepted findings are fixed and retested;
6. rejected findings should have a concrete technical reason;
7. merge occurs only when required repository checks are green and the primary workflow is satisfied.

Claude review should initially be **advisory, not a required branch-protection check**, because missing external authentication must never block repository development. Once the integration is proven reliable and its access/cost model is accepted, making the read-only review check required can be reconsidered.

## Discussion model

The practical "discussion" between AI reviewers happens through auditable CI evidence:

- Claude emits objections/ideas in the read-only workflow report;
- the primary workflow reads that report through GitHub;
- implementation/tests are updated where justified;
- the primary workflow can add a concise PR disposition comment summarizing what was accepted or rejected and why;
- final decision remains with the primary workflow.

This preserves the repository's no-write CI hardening policy while keeping the review loop auditable.

## Cost rule

The existing Minarva rule remains authoritative: no new mandatory paid infrastructure before at least 25 paying customers unless explicitly approved.

Therefore:

- the Claude reviewer is gated off until usable authentication is supplied;
- no paid Anthropic API key is created or assumed by this repository change;
- ordinary CI and development continue normally if Claude is disabled.

## Security note

Claude Code Action can inspect CI results when `actions: read` is granted. Its official documentation also warns about untrusted input and bot-trigger behavior. This workflow runs only on repository PR events, does not enable arbitrary non-write users/bots, does not expose full Claude output logs, and grants no content-write permission.
