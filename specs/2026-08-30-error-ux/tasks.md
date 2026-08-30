# Tasks: Friendly API failures and network-pipe warnings

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-30-error-ux` |

## Phase 0 — Preparation

- [x] T0.1 — Read product, architecture, security, UI and tool execution context.
- [x] T0.2 — Create and approve spec/plan.
- [x] T0.3 — Classify high risk and define fail-closed criteria.
- [x] T0.4 — Create feature branch.

## Phase 1 — Implementation

- [x] T1.1 — Add API error classification and rate-limit messaging *(AC-01, AC-02, AC-04)*.
- [x] T1.2 — Add network-pipe detector and specialized confirmation *(AC-03, AC-04)*.
- [x] T1.3 — Add regression tests *(AC-01–AC-04)*.

## Phase 2 — Verification

- [x] T2.1 — Run syntax checks, tests and diff checks.
- [x] T2.2 — Verify acceptance criteria.

## Phase 3 — Documentation

- [x] T3.1 — Sync affected docs and feature registry.
- [ ] T3.2 — Mark spec implemented and commit explicit paths.

## Acceptance Criteria Verification Log

| AC | Status | Evidence |
|----|--------|----------|
| AC-01 | ✅ | `test/api-client.test.js` verifies actionable classifications for common statuses/codes. |
| AC-02 | ✅ | `getRetryDelayMs()` returns 10 seconds for 429 without `Retry-After`. |
| AC-03 | ✅ | `test/error-ux.test.js` detects curl/wget-to-shell patterns and rejects ordinary pipes. |
| AC-04 | ✅ | Existing agent overflow/fallback tests remain green; original error flow is preserved. |

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| | | |
