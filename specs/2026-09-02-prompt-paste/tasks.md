# Tasks: Preserve pasted multiline prompts

| Field | Value |
|-------|-------|
| **Spec** | `2026-09-02-prompt-paste` |

---

## Phase 0 — Preparation

- [x] T0.1 — Read relevant documentation (PRD, architecture, visual identity, ADRs) — *Rule 1 of `.clinerules`*
- [x] T0.2 — Confirm this spec and plan are `approved`
- [x] T0.3 — Classify risk, map threat surfaces and confirm the plan's gates
- [ ] T0.4 — Create/switch to the feature branch — deferred: preserve existing user worktree changes

## Phase 1 — Implementation

- [x] T1.1 — Add bracketed-paste lifecycle to the idle prompt. *(AC-01, AC-02, AC-04)*
- [x] T1.2 — Align active-turn prompt paste handling with the same lifecycle. *(AC-03, AC-04)*
- [x] T1.3 — Add deterministic idle and active multiline-paste regression tests. *(AC-01–AC-04)*

## Phase 2 — Testing, Security and Verification

- [x] T2.1 — Run targeted positive and lifecycle regression tests.
- [x] T2.2 — Run `node --check`, `npm test`, `npm run lint`, and a non-interactive smoke test.
- [x] T2.3 — Verify all acceptance criteria and record evidence.

## Phase 3 — Documentation and Closing

- [x] T3.1 — Update the existing terminal-UI feature registry; existing index row already covers Terminal UI.
- [x] T3.2 — Record the CHANGELOG entry.
- [x] T3.3 — Update the spec status and closeout evidence.

## Acceptance Criteria Verification Log

| AC | Status | Evidence (how it was verified) |
|----|--------|--------------------------------|
| AC-01 | ✅ | Targeted prompt tests emulate `paste-start`, two internal `Enter`s and `paste-end`, retaining `Title` plus two list items before submission. |
| AC-02 | ✅ | A later Enter invokes `onSubmit` once with `Title\n- first\n- second`. |
| AC-03 | ✅ | Active-turn regression invokes `onLine` once with the complete normalized payload. |
| AC-04 | ✅ | Both regressions capture `ESC[?2004h` on ownership and `ESC[?2004l` on cleanup. |
| AC-05 | ✅ | `node --check` passed for both UI modules; targeted tests and `npm test` passed (39 test files); `node bin/emile.js --help` smoke test passed. Lint runs with one pre-existing error in `test/empty-stream-line.test.js:12` and 155 pre-existing warnings; it does not report either touched module. |

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| | | |
