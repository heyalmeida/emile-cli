# Tasks: Preflight Plans approval and compression fallback

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-30-plans-compression-resilience` |

## Phase 0 — Preparation

- [x] T0.1 — Read relevant documentation and `IMPROVEMENTS.md` §§3.4–3.5.
- [x] T0.2 — Create and approve the spec and plan.
- [x] T0.3 — Classify the work as High risk and map approval/history surfaces.
- [x] T0.4 — Create/switch to `fix/plans-compression-resilience`; preserve `tmp-fix-thinking.mjs`.

## Phase 1 — Implementation

- [x] T1.1 — Move Plans approval before the first model stream and add bounded preview *(AC-01–AC-03)*.
- [x] T1.2 — Add 70% hard-truncation fallback for summarization failure *(AC-04–AC-06)*.
- [x] T1.3 — Add approval and fallback regression tests *(AC-01–AC-06)*.

## Phase 2 — Testing and Verification

- [x] T2.1 — Run approval cancellation/order and compression fallback tests.
- [x] T2.2 — Run `node --check`, `npm test`, `git diff --check` and manual smoke checks.
- [x] T2.3 — Verify all acceptance criteria and record evidence below.

## Phase 3 — Documentation and Closing

- [x] T3.1 — Update architecture, PRD, `IMPROVEMENTS.md` and `CHANGELOG.md`.
- [x] T3.2 — Set spec and plan status to `implemented`.
- [ ] T3.3 — Commit implementation and documentation with explicit paths.
- [x] T3.4 — Record limitations and residual risk.

## Acceptance Criteria Verification Log

| AC | Status | Evidence (how it was verified) |
|----|---------|--------------------------------|
| AC-01 | ✅ | `test/plans-compression.test.js`: injected approval callback receives preview before the injected completion callback. |
| AC-02 | ✅ | Rejection test asserts zero completion calls and zero assistant messages. |
| AC-03 | ✅ | Approval test asserts one completion call and the existing `Plan approved` instruction in history. |
| AC-04 | ✅ | `test/compression.test.js`: thrown summarizer triggers truncation against a 70% target with a large fixture. |
| AC-05 | ✅ | `hardTruncateHistory()` preserves `messages[0]` and the newest complete user group; compression invokes no tool handler. |
| AC-06 | ✅ | Low-history and hysteresis assertions return safely without repeated summarizer calls. |

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| | | |
