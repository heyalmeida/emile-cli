# Tasks: Dynamic model catalog in model selection

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-30-dynamic-model-catalog-ui` |

## Phase 0 — Preparation

- [x] T0.1 — Read mandatory product, architecture, security, visual and model-catalog context.
- [x] T0.2 — Create and approve spec/plan.
- [x] T0.3 — Classify medium risk and map remote metadata boundaries.
- [x] T0.4 — Create `feat/dynamic-model-catalog-ui` and preserve unrelated working-tree files.

## Phase 1 — Implementation

- [x] T1.1 — Expose normalized dynamic catalog listing and active-state helpers *(AC-01–AC-04)*.
- [x] T1.2 — Integrate live OpenRouter entries and metadata labels into `/model` with fallback *(AC-01–AC-03)*.
- [x] T1.3 — Add catalog formatting/fallback regression tests *(AC-02–AC-04)*.

## Phase 2 — Verification

- [x] T2.1 — Run tests and syntax checks.
- [x] T2.2 — Verify acceptance criteria and record evidence.

## Phase 3 — Documentation and Closing

- [x] T3.1 — Sync architecture, feature registry, `IMPROVEMENTS.md` and `CHANGELOG.md`.
- [ ] T3.2 — Set spec/plan to implemented and commit explicit paths.

## Acceptance Criteria Verification Log

| AC | Status | Evidence |
|----|--------|----------|
| AC-01 | ✅ | `runModelWizard()` awaits `initModelCatalog()` before using OpenRouter entries. |
| AC-02 | ✅ | `test/models.test.js` verifies bounded id plus context and pricing formatting. |
| AC-03 | ✅ | `getDynamicModels()` returns empty for non-OpenRouter/unavailable catalogs, preserving curated options. |
| AC-04 | ✅ | Normalized ids and bounded labels ignore malformed metadata without exposing credentials. |

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| | | |
