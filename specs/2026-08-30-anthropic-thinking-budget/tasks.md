# Tasks: Native Anthropic thinking budgets

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-30-anthropic-thinking-budget` |

## Phase 0 — Preparation

- [x] T0.1 — Read API, model, product, architecture and security context.
- [x] T0.2 — Create and approve spec/plan.
- [x] T0.3 — Classify medium risk and define provider regression criteria.
- [x] T0.4 — Create feature branch.

## Phase 1 — Implementation

- [x] T1.1 — Add Anthropic-family native thinking budget mapping *(AC-01–AC-03)*.
- [x] T1.2 — Add API parameter regression tests *(AC-01–AC-03)*.

## Phase 2 — Verification

- [x] T2.1 — Run syntax checks, tests and diff checks.
- [x] T2.2 — Verify acceptance criteria.

## Phase 3 — Documentation

- [x] T3.1 — Sync product, architecture, model feature, backlog and changelog.
- [ ] T3.2 — Mark spec implemented and commit explicit paths.

## Acceptance Criteria Verification Log

| AC | Status | Evidence |
|----|--------|----------|
| AC-01 | ✅ | API tests verify low/high/max native budgets for Requesty Anthropic-family models. |
| AC-02 | ✅ | API test verifies `{ thinking: { type: 'disabled' } }` for `none`. |
| AC-03 | ✅ | Existing OpenRouter and generic mapping tests remain green. |

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| | | |
