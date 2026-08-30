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

- [ ] T1.1 — Add a pure case-insensitive model-option filter with a hard seven-item result cap *(AC-01, AC-02, AC-05)*.
- [ ] T1.2 — Add the bounded TTY picker with query editing, navigation, selection, cancellation and non-TTY fallback *(AC-01, AC-03, AC-05)*.
- [ ] T1.3 — Replace the unbounded `/model` select while preserving OpenRouter initialization, curated provider fallback and custom model entry *(AC-03, AC-04)*.
- [ ] T1.4 — Add regression tests for filtering, field matching, cap, empty/no-match queries and safe labels *(AC-01, AC-02, AC-05)*.

## Phase 2 — Testing, Security and Verification

- [ ] T2.1 — Run positive, negative, boundary and regression tests; record output.
- [ ] T2.2 — Run `node --check`, `npm test`, `npm run lint`, `git diff --check` and the CLI smoke test; record limitations.
- [ ] T2.3 — Perform the manual narrow-terminal/raw-mode interaction script *(AC-03, AC-05)*.
- [ ] T2.4 — Verify all acceptance criteria one by one.

## Phase 3 — Documentation and Closing

- [ ] T3.1 — Sync README, product/architecture/visual docs, feature registry and CHANGELOG as applicable.
- [ ] T3.2 — Record the model-system change history and index references.
- [ ] T3.3 — Revalidate touched Mermaid blocks and relative links.
- [ ] T3.4 — Update the spec status to `implemented` after verification.
- [ ] T3.5 — Commit implementation on `feat/model-system` and documentation closeout on `docs/documentation`.
- [ ] T3.6 — Record limitations and residual risk in the handoff.

## Acceptance Criteria Verification Log

| AC | Status | Evidence (how it was verified) |
|----|--------|--------------------------------|
| AC-01 | ⏳ | |
| AC-02 | ⏳ | |
| AC-03 | ⏳ | |
| AC-04 | ⏳ | |
| AC-05 | ⏳ | |

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| | | |
