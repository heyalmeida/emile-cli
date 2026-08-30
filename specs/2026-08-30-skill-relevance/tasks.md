# Tasks: Relevance-gated workspace skills

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-30-skill-relevance` |

## Phase 0 — Preparation

- [x] T0.1 — Read skills, prompt, architecture, security and product context.
- [x] T0.2 — Create and approve spec/plan.
- [x] T0.3 — Classify medium risk and define explicit-selection fail-safe.
- [x] T0.4 — Create feature branch.

## Phase 1 — Implementation

- [x] T1.1 — Add keyword relevance filtering with explicit-list bypass *(AC-01–AC-03)*.
- [x] T1.2 — Integrate filtered names into agent cache/system prompt flow *(AC-01–AC-04)*.
- [x] T1.3 — Add regression tests *(AC-01–AC-04)*.

## Phase 2 — Verification

- [x] T2.1 — Run syntax checks, tests and diff checks.
- [x] T2.2 — Verify acceptance criteria.

## Phase 3 — Documentation

- [x] T3.1 — Sync product, architecture, feature registry, backlog and changelog.
- [ ] T3.2 — Mark spec implemented and commit explicit paths.

## Acceptance Criteria Verification Log

| AC | Status | Evidence |
|----|--------|----------|
| AC-01 | ✅ | Injected catalog test selects `react-patterns` for a React task. |
| AC-02 | ✅ | Unrelated `python-patterns` is omitted while `clean-code` remains active. |
| AC-03 | ✅ | Explicit `react-patterns` survives an unrelated prompt. |
| AC-04 | ✅ | Filtering occurs before the existing 8k/24k compilation caps. |

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| | | |
