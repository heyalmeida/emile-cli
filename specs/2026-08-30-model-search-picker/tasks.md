# Tasks: Incremental model search picker

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-30-model-search-picker` |

## Phase 0 — Preparation

- [x] T0.1 — Read relevant PRD, architecture, visual identity, security, glossary and ADR context.
- [x] T0.2 — Confirm this spec and plan are `approved`.
- [x] T0.3 — Classify medium risk and map raw-mode/catalog display boundaries.
- [x] T0.4 — Confirm `feat/model-system` and `docs/documentation` workflow.

## Phase 1 — Implementation

- [x] T1.1 — Add a pure case-insensitive model-option filter with a hard seven-item result cap *(AC-01, AC-02, AC-05)*.
- [x] T1.2 — Add the bounded TTY picker with query editing, navigation, selection, cancellation and non-TTY fallback *(AC-01, AC-03, AC-05)*.
- [x] T1.3 — Replace the unbounded `/model` select while preserving OpenRouter initialization, curated provider fallback and custom model entry *(AC-03, AC-04)*.
- [x] T1.4 — Add regression tests for filtering, field matching, cap, empty/no-match queries and safe labels *(AC-01, AC-02, AC-05)*.

## Phase 2 — Testing, Security and Verification

- [x] T2.1 — Run positive, negative, boundary and regression tests; record output.
- [x] T2.2 — Run `node --check`, `npm test`, `npm run lint`, `git diff --check` and the CLI smoke test; record limitations.
- [x] T2.3 — Perform the manual narrow-terminal/raw-mode interaction script *(AC-03, AC-05)*.
- [x] T2.4 — Verify all acceptance criteria one by one.

## Phase 3 — Documentation and Closing

- [x] T3.1 — Sync README, product/architecture/visual docs, feature registry and CHANGELOG as applicable.
- [x] T3.2 — Record the model-system change history and index references.
- [x] T3.3 — Revalidate touched Mermaid blocks and relative links.
- [x] T3.4 — Update the spec status to `implemented` after verification.
- [x] T3.5 — Commit implementation on `feat/model-system` and documentation closeout on `docs/documentation`.
- [x] T3.6 — Record limitations and residual risk in the handoff.

## Acceptance Criteria Verification Log

| AC | Status | Evidence (how it was verified) |
|----|--------|--------------------------------|
| AC-01 | ✅ | `filterModelOptions()` and pseudo-TTY render cap the initial picker at seven result entries (six models plus the manual-entry action). |
| AC-02 | ✅ | `test/model-picker.test.js` verifies case-insensitive substring matching against ids and labels; live pseudo-TTY input `model-9` reduced the list to that match. |
| AC-03 | ✅ | Pseudo-TTY Enter selected `provider/model-9`; picker cleanup restores raw mode/listeners; cancellation returns `null`, and `runModelWizard()` does not save it. |
| AC-04 | ✅ | `runModelWizard()` still awaits `initModelCatalog()` for OpenRouter and keeps curated provider options otherwise; existing catalog tests remain green. |
| AC-05 | ✅ | Tests cover no-match/manual fallback and control sanitization; non-TTY invocation returned `NON_TTY_CANCEL_OK`; source checks/lint passed with pre-existing warnings only. |

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| `d6f47c7` | `feat(model): add incremental model search picker` | `src/commands.js`, `src/ui/index.js`, `src/ui/model-picker.js`, `test/model-picker.test.js` |
