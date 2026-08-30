# Tasks: UI-owned logging and unified prompt language

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-30-ui-logging-prompt` |

## Phase 0 — Preparation

- [x] T0.1 — Read relevant documentation and `IMPROVEMENTS.md` §§2.4–2.5.
- [x] T0.2 — Create and approve the spec and plan.
- [x] T0.3 — Classify the work as Medium risk and map rendering/prompt surfaces.
- [x] T0.4 — Create/switch to `refactor/ui-logging-prompt`; preserve `tmp-fix-thinking.mjs`.

## Phase 1 — Implementation

- [x] T1.1 — Migrate touched runtime colors to `C`/UI theme *(AC-01, AC-02)*.
- [x] T1.2 — Translate the base prompt policy fragments to English *(AC-03)*.
- [x] T1.3 — Add regression checks for palette ownership and prompt language *(AC-01, AC-03)*.

## Phase 2 — Testing and Verification

- [x] T2.1 — Run targeted searches, `node --check`, `npm test` and the UI harness *(AC-01, AC-02, AC-04)*.
- [x] T2.2 — Verify all acceptance criteria and record evidence below.

## Phase 3 — Documentation and Closing

- [x] T3.1 — Update architecture, `IMPROVEMENTS.md` and `CHANGELOG.md`.
- [x] T3.2 — Set spec and plan status to `implemented`.
- [x] T3.3 — Commit implementation and documentation with explicit paths.
- [ ] T3.4 — Record limitations and residual risk.

## Acceptance Criteria Verification Log

| AC | Status | Evidence (how it was verified) |
|----|---------|--------------------------------|
| AC-01 | ✅ | Targeted search and regression test find no `picocolors` import or duplicate color helper in touched runtime modules. |
| AC-02 | ✅ | `C` palette replacements preserve warning/error/success/dim semantic output; full suite passes. |
| AC-03 | ✅ | `src/prompt.js` now uses English Read-Before-Write and No Assumptions policy lines; safety/refusal and verification rules remain. |
| AC-04 | ✅ | `npm test` passes all 12 test files and syntax checks pass for every touched JS file. |

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| `549b709` | `refactor(ui): centralize runtime colors and prompt language` | Runtime palette migration, prompt translation and regression tests |
| `134303c` | `docs(ui): record logging and prompt cleanup` | Backlog, changelog and spec synchronization |
