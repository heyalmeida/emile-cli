# Tasks: Readable token-count units

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-30-readable-token-units` |

## Phase 0 — Preparation

- [x] T0.1 — Read the model-system and UI documentation relevant to token-count display.
- [x] T0.2 — Create the approved spec and plan.
- [x] T0.3 — Confirm low-risk presentation-only scope.

## Phase 1 — Implementation

- [x] T1.1 — Add an `M` branch to `fmtK()` for values at or above one million *(AC-01–AC-04)*.
- [x] T1.2 — Add formatter regression tests while preserving catalog-label coverage *(AC-01–AC-05)*.

## Phase 2 — Verification

- [x] T2.1 — Run syntax check, tests, lint and diff check.
- [x] T2.2 — Verify all acceptance criteria.

## Phase 3 — Documentation and Closing

- [x] T3.1 — Update feature history and CHANGELOG on `docs/documentation`.
- [x] T3.2 — Mark the spec implemented and record commit evidence.

## Acceptance Criteria Verification Log

| AC | Status | Evidence |
|----|--------|----------|
| AC-01 | ✅ | `fmtK(1_000_000)` now returns `1M`; the footer/status consumers already use `fmtK()`. |
| AC-02 | ✅ | `fmtK(1_048_576)` returns `1M`. |
| AC-03 | ✅ | `fmtK(1_500_000)` returns `1.5M`. |
| AC-04 | ✅ | `fmtK(128_000)` remains `128k`. |
| AC-05 | ✅ | Existing catalog-label and malformed-metadata tests remain green. |

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| `566b119` | `fix(ui): format million token counts compactly` | `src/ui/theme.js`, `test/models.test.js` |
