# Tasks: Human-readable model context labels

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-30-model-context-display` |

## Phase 0 — Preparation

- [x] T0.1 — Read the model-system and UI documentation relevant to catalog labels.
- [x] T0.2 — Create the approved spec and plan.
- [x] T0.3 — Confirm low-risk presentation-only scope.

## Phase 1 — Implementation

- [x] T1.1 — Format million-token context values with an `M` suffix *(AC-01, AC-02)*.
- [x] T1.2 — Add regression coverage for million, thousand and invalid values *(AC-01–AC-03)*.

## Phase 2 — Verification

- [x] T2.1 — Run syntax check, tests, lint and diff check.
- [x] T2.2 — Verify all acceptance criteria.

## Phase 3 — Documentation and Closing

- [x] T3.1 — Update feature history and CHANGELOG on `docs/documentation`.
- [x] T3.2 — Mark the spec implemented and record commit evidence.

## Acceptance Criteria Verification Log

| AC | Status | Evidence |
|----|--------|----------|
| AC-01 | ✅ | `test/models.test.js` confirms `1_000_000` renders as `1M ctx`, never `1000k ctx`. |
| AC-02 | ✅ | Existing regression confirms `128_000` renders as `128k ctx`. |
| AC-03 | ✅ | Existing malformed metadata regression confirms `context n/a`. |

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| `33775a6` | `fix(model): use readable million context labels` | `src/commands.js`, `test/models.test.js` |
