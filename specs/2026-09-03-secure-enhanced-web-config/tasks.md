# Tasks — Protect enhanced web-search credentials

| Field | Value |
|-------|-------|
| **Spec** | `2026-09-03-secure-enhanced-web-config` |

## Phase 0 — Preparation

- [x] T0.1 — Read enhanced web-search, secure configuration, architecture, security and test documentation.
- [x] T0.2 — Create the approved spec and plan.
- [x] T0.3 — Classify the change as high risk and map secret migration/output boundaries.
- [x] T0.4 — Preserve the current enhanced mode/provider state and do not perform branch operations.

## Phase 1 — Implementation

- [x] T1.1 — Expose a narrow protected-secret adapter from `src/config.js`.
- [x] T1.2 — Migrate and save Tavily/Firecrawl keys outside `.emile/web.json`.
- [x] T1.3 — Preserve enhanced mode and independent provider flags.
- [x] T1.4 — Update command failure handling without exposing secrets.
- [x] T1.5 — Add/update focused tests.

## Phase 2 — Testing, Security and Verification

- [x] T2.1 — Focused enhanced/config/command/provider-tool tests passed: 27/27. — Run focused enhanced/config/command tests.
- [x] T2.2 — Syntax checks passed; `npm run lint` completed with 0 errors (existing warnings only); full suite status is 243 passed, 6 unrelated Windows failures and 2 skipped mode checks. — Run syntax, lint and full suite with environment-failure record.
- [x] T2.3 — Real workspace hydration/migration check confirmed enhanced mode, both providers ready, and `.emile/web.json` contains no Tavily/Firecrawl key fields; no paid web query was issued. — Run real CLI restart E2E and inspect web.json/output for plaintext keys.
- [x] T2.4 — Tool composition check returned `searchWeb` and `browsePage`; focused provider-tool tests confirm native/enhanced gating and bounded results. — Verify native and enhanced tool composition remain correctly gated.

## Phase 3 — Documentation and Closing

- [x] T3.1 — Synced README, product, architecture, security docs, enhanced-search spec, changelog and secure-configuration feature registry. — Sync README, product, architecture, security docs, changelog and feature registry.
- [x] T3.2 — Marked spec/plan/tasks implemented. — Mark spec/plan/tasks implemented.
- [x] T3.3 — Recorded residual risk: enhanced provider state remains workspace-specific; credentials are per-user protected; no paid query was executed during configuration validation. — Record residual risks and migration evidence.

## Acceptance Criteria Verification Log

| AC | Status | Evidence |
|----|--------|----------|
| AC-01 | ✅ | Real hydration check loaded both protected providers and sanitized `.emile/web.json`. |
| AC-02 | ✅ | Focused save test confirmed keys are stored in protected entries and absent from JSON. |
| AC-03 | ✅ | Migration test preserved flags, removed plaintext fields and loaded both keys. |
| AC-04 | ✅ | Code path retains legacy input on protected-store failure and uses bounded command error. |
| AC-05 | ✅ | Tool composition returned `searchWeb` and `browsePage`; provider tests passed. |
| AC-06 | ✅* | Focused tests, syntax, lint and real config check passed; full suite has 243 passed, 6 unrelated Windows failures and 2 skipped mode checks. |

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| — | Not created automatically | — |
