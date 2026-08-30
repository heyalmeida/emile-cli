# Tasks: Modular CLI command dispatch

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-30-cli-command-modules` |

## Phase 0 — Preparation

- [x] T0.1 — Read relevant project documentation and `IMPROVEMENTS.md` §2.1.
- [x] T0.2 — Create the approved spec and implementation plan.
- [x] T0.3 — Classify the refactor as Medium risk and map command/session/filesystem surfaces.
- [x] T0.4 — Create/switch to `refactor/cli-command-modules`; preserve `tmp-fix-thinking.mjs`.

## Phase 1 — Implementation

- [x] T1.1 — Define the command context and exact-match registry *(AC-03, AC-05)*.
- [x] T1.2 — Move existing slash-command behavior behind handlers without behavior changes *(AC-01, AC-04)*.
- [x] T1.3 — Wire the REPL fallback and command registry from `cli.js` *(AC-02, AC-03)*.
- [x] T1.4 — Add isolated registry tests *(AC-01, AC-03, AC-05)*.

## Phase 2 — Testing and Verification

- [x] T2.1 — Run positive, unknown-command, cancellation and syntax checks.
- [x] T2.2 — Run `npm test`, `node --check` on touched JS files and CLI smoke/manual checks.
- [x] T2.3 — Verify all acceptance criteria and record evidence below.

## Phase 3 — Documentation and Closing

- [x] T3.1 — Update architecture, `IMPROVEMENTS.md` and `CHANGELOG.md`.
- [x] T3.2 — Revalidate documentation links/Mermaid.
- [x] T3.3 — Set the spec and plan status to `implemented`.
- [x] T3.4 — Commit implementation and documentation with explicit paths.
- [x] T3.5 — Record limitations and residual risk.

## Acceptance Criteria Verification Log

| AC | Status | Evidence (how it was verified) |
|----|---------|--------------------------------|
| AC-01 | ✅ | `commands.test.js` enumerates every existing command; handlers preserve the prior branches. |
| AC-02 | ✅ | `cli.js` dispatches only exact registry matches and retains the existing `runAgent` fallback. |
| AC-03 | ✅ | `dispatchCommand('/unknown', ...)` returns `false` without invoking a handler. |
| AC-04 | ✅ | Interactive session cancellation remains owned by the REPL; `/switch` cancellation returns to waiting, while shutdown paths remain in `cli.js`. |
| AC-05 | ✅ | `src/commands/index.js` owns lookup and `handlers.js` receives explicit context; `cli.js` contains no command-specific branch chain. |

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| `627602c` | `refactor(commands): modularize slash-command dispatch` | `src/cli.js`, `src/commands/`, `test/commands.test.js` |
