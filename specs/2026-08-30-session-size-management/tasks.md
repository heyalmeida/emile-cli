# Tasks: Bounded session snapshots and cleanup

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-30-session-size-management` |

## Phase 0 — Preparation

- [x] T0.1 — Read session, config, command, security and product context.
- [x] T0.2 — Create and approve spec/plan.
- [x] T0.3 — Classify high risk and define deletion boundaries.
- [x] T0.4 — Create feature branch.

## Phase 1 — Implementation

- [x] T1.1 — Add bounded persisted snapshot projection *(AC-01, AC-02)*.
- [x] T1.2 — Add config/CLI limit and `/sessions clean N` *(AC-03, AC-04)*.
- [x] T1.3 — Add regression tests *(AC-01–AC-04)*.

## Phase 2 — Verification

- [x] T2.1 — Run syntax checks, tests and diff checks.
- [x] T2.2 — Verify acceptance criteria.

## Phase 3 — Documentation

- [x] T3.1 — Sync README/product/architecture/security/feature/backlog/changelog.
- [ ] T3.2 — Mark spec implemented and commit explicit paths.

## Acceptance Criteria Verification Log

| AC | Status | Evidence |
|----|--------|----------|
| AC-01 | ✅ | `trimPersistedMessages()` replaces oldest tool content when the configured limit is exceeded. |
| AC-02 | ✅ | Regression test confirms the source message list retains full tool output. |
| AC-03 | ✅ | `cleanSessions(7)` removes the old temporary record and preserves the recent one. |
| AC-04 | ✅ | Invalid cleanup age returns without deleting any file; invalid size does not trim. |

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| | | |
