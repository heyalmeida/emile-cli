# Tasks: Keep model reasoning out of persisted sessions by default

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-30-session-reasoning-retention` |

## Phase 0 — Preparation

- [x] T0.1 — Read mandatory persistence, UI, product and security context.
- [x] T0.2 — Create and approve spec/plan.
- [x] T0.3 — Classify medium risk and define non-mutation/opt-in criteria.
- [x] T0.4 — Create the feature branch.

## Phase 1 — Implementation

- [x] T1.1 — Add non-mutating persisted message projection *(AC-01, AC-02, AC-04)*.
- [x] T1.2 — Add explicit export-thinking opt-in *(AC-03)*.
- [x] T1.3 — Add regression tests *(AC-01–AC-04)*.

## Phase 2 — Verification

- [x] T2.1 — Run syntax checks, tests and diff checks.
- [x] T2.2 — Verify acceptance criteria.

## Phase 3 — Documentation

- [x] T3.1 — Sync README, product, architecture, feature registry, backlog and changelog.
- [ ] T3.2 — Mark spec implemented and commit explicit paths.

## Acceptance Criteria Verification Log

| AC | Status | Evidence |
|----|--------|----------|
| AC-01 | ✅ | `preparePersistedMessages()` removes `reasoning_content`; session writes use this projection. |
| AC-02 | ✅ | `test/session-reasoning.test.js` asserts the source message remains unchanged. |
| AC-03 | ✅ | Export regression test verifies default omission and explicit opt-in inclusion. |
| AC-04 | ✅ | Tool calls and ordinary message fields remain equal in the persisted projection. |

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| | | |
