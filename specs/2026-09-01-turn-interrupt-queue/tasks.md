# Tasks: Turn interrupt and message queue

| Field | Value |
|-------|-------|
| **Spec** | `2026-09-01-turn-interrupt-queue` |

---

## Phase 1 — Implementation

- [x] T1.1 — `src/agent/turn-control.js`: `createTurnControl()` (stop flag, reason, reset) *(AC-01)*
- [x] T1.2 — `src/agent/agent.js`: `control` option with checks at loop start, mid-stream (with best-effort `controller.abort()`) and around tool execution; history-consistent cancel handling *(AC-02/AC-03)*
- [x] T1.3 — `src/ui/turn-keys.js`: raw-mode key listener during turns (Esc/Ctrl+C cancel, Enter queues, Backspace/Ctrl+U edit) + `ui/index.js` barrel export *(AC-01/AC-04)*
- [x] T1.4 — `src/cli.js`: REPL refactor — `runAgentTurn()` with control+listener, queue drain between turns, `/` dispatch and `exit` handling for queued lines *(AC-04)*
- [x] T1.5 — Tests: `test/turn-interrupt.test.js` (control semantics, mid-stream text keep, tool-call drop, mid-batch placeholders) *(AC-05)*

## Phase 2 — Verification

- [x] T2.1 — `node --check` passed on `src/agent/turn-control.js`, `src/agent/agent.js`, `src/agent/index.js`, `src/ui/turn-keys.js`, `src/ui/index.js`, `src/cli.js`, `test/turn-interrupt.test.js`
- [x] T2.2 — `npm test`: 157 passed, 0 failed (4 new)
- [x] T2.3 — Manual PTY smoke deferred: requires a live provider turn; automated tests cover all cancel paths with fake streams

## Phase 3 — Docs

- [x] T3.1 — `README.md` (while-the-agent-is-working behavior), `CHANGELOG.md`, `features/agent-loop.md`, `docs/visual-identity.md` (turn-keys row), spec status → `implemented`

## Phase 4 — Persistent prompt regression follow-up

- [x] T4.0 — Read the PRD, architecture, visual identity, quality/security policy, glossary, ADR-0001 and related prompt specs; classify risk as medium *(AC-04/AC-06/AC-07)*
- [x] T4.1 — Added initially failing regressions for Tab completion/fallback and exclusive `/switch` stdin ownership *(AC-06/AC-07)*
- [x] T4.2 — Serialized persistent-prompt, picker and active-turn key ownership; kept the compact live row during agent work *(AC-04/AC-07)*
- [x] T4.3 — Ran focused tests, `node --check`, full tests, lint and proportional PTY/narrow-width smoke *(AC-05)*
- [x] T4.4 — Synced CHANGELOG, product/architecture/visual docs and feature registry; restored spec status to `implemented` *(AC-04/AC-05/AC-06/AC-07)*

## Phase 5 — Active-prompt visual parity follow-up

- [x] T5.1 — Add failing regressions proving the full standard frame remains during a turn, the selected autocomplete marker is not `❯`, and the real cursor does not remain on the spinner *(AC-04/AC-08/AC-09)*
- [x] T5.2 — Share full-prompt layout/footer/matches with `listenTurnKeys`, including active Tab/arrow autocomplete and prompt-aware stdout arbitration, without overlapping stdin listeners *(AC-04/AC-06/AC-08/AC-09)*
- [x] T5.3 — Run focused tests, syntax checks, full tests, lint and bounded-width PTY verification *(AC-05)*
- [x] T5.4 — Synchronize docs/feature registry/CHANGELOG and restore the spec status to `implemented` *(AC-04/AC-08)*

---

## Acceptance Criteria Verification Log

| AC | Status | Evidence |
|----|--------|----------|
| AC-01 | ✅ | Esc/Ctrl+C call `control.requestStop()` in `listenTurnKeys`; loop-start check prints `Turn canceled.` and breaks without exiting the process (unit + code path). |
| AC-02 | ✅ | `test/turn-interrupt.test.js` — mid-stream cancel keeps partial text `partial ` and never consumes `discarded`. |
| AC-03 | ✅ | `test/turn-interrupt.test.js` — tool-call stream cancel drops the assistant message; mid-batch cancel fills `call_b` with `[canceled by user]`. |
| AC-04 | ✅ | `listenTurnKeys` renders the shared full frame throughout active turns; sanitized input still enters `pendingQueue` and drains sequentially. Visibility, FIFO and PTY checks passed. |
| AC-05 | ✅ | `node --check` passed for all touched JS; `npm test` passed 37 test files with 0 failures; targeted ESLint passed with 0 findings. Full `npm run lint` exited 0 with the documented pre-existing warning baseline. |
| AC-06 | ✅ | `test/prompt-input-render.test.js` verifies `/m` + Tab becomes `/model` without toggling Plans mode and that Tab with no match still toggles it; repeated in the PTY smoke. |
| AC-07 | ✅ | `test/prompt-input-render.test.js` asserts a single keypress listener during the real switch picker, resumed stdin after cleanup and immediate post-switch typing; PTY smoke ran `/switch`, typed `x`, then exited normally. |
| AC-08 | ✅ | Idle and active autocomplete tests assert selected rows use `●`, while exactly one `❯` remains on the real input row. |
| AC-09 | ✅ | The ANSI terminal emulator asserts repeated agent writes leave one intact draft and the real cursor immediately after its text; PTY smokes passed at 60/80/120 columns with spinner and simulated reasoning output. |

## Regression Follow-up Verification Log (2026-09-01)

| Check | Result |
|-------|--------|
| Pre-fix focused regression run | Failed as intended: prompt-render suite detected Tab and duplicate `/switch` ownership regressions. |
| Syntax | `node --check` passed for `src/agent/agent.js`, `src/agent/turn-control.js`, `src/api/client.js`, `src/cli.js`, `src/ui/index.js`, `src/ui/prompt-input-persistent.js` and both new test files. |
| Focused behavior | Prompt render, turn-key visibility and FIFO queue test files passed. Layout assertions cover 60/80/120 columns; Esc clears a draft without dropping the listener. |
| Full regression suite | `npm test`: 37 test files passed, 0 failed. |
| Lint | `npx eslint` on the changed CLI/prompt/test paths: 0 findings. Full `npm run lint`: exit 0; existing warnings elsewhere remain out of scope. |
| Manual PTY | From `/tmp` with a disposable Requesty value and no MCP config: prompt rendered, `/m` + Tab completed `/model`, `/switch` returned to an immediately writable prompt, and `exit` ended with code 0. No model request was made. |
| Workspace smoke limitation | `node bin/emile.js --verbose` in the repository did not reach the prompt because an existing configured MCP connection stayed in its startup spinner; canceled with Ctrl+C. This occurs before the changed REPL path and is not treated as a prompt regression result. |
| Live-provider turn | Not executed to avoid an external API call/cost; active-turn behavior is covered by fake-stream agent tests and `turn-keys` visibility tests. |

## Active-frame Follow-up Verification Log (2026-09-02)

| Check | Result |
|-------|--------|
| Pre-fix visual regressions | Failed as intended: the active renderer still emitted the compact placeholder, reused `❯` for a selected suggestion, returned the real cursor to the spinner and did not redraw after agent writes. |
| Syntax | `node --check` passed for `src/cli.js`, `src/ui/prompt-input-persistent.js`, `src/ui/turn-keys.js` and `src/ui/spinner.js`. |
| Focused behavior | Prompt render, active-frame visibility/cursor, FIFO queue and turn-interrupt tests passed. |
| ANSI screen/cursor | The emulator confirms one latest draft row remains after repeated output and the terminal cursor lands immediately after `abc`, not on the spinner. |
| Full regression suite | `npm test`: 37 test files passed, 0 failed. |
| Lint | Targeted ESLint: 0 findings. Full `npm run lint`: exit 0 with 155 documented pre-existing warnings and 0 errors. |
| PTY widths | Real PTY smokes at 60, 80 and 120 columns completed with `PTY_OK`, preserving `abc` through spinner and simulated reasoning writes. |
| Live-provider limitation | No post-fix provider request was made to avoid external cost; the deterministic active-turn harness exercises the same stdout/spinner path. |

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| `4433660` | `fix(ui): restore persistent prompt input lifecycle` | `src/cli.js`, `src/ui/index.js`, `src/ui/prompt-input-persistent.js`, `test/persistent-queue.test.js`, `test/prompt-input-render.test.js` |
| `676b815` | `fix(ui): stabilize active prompt rendering` | `src/cli.js`, `src/ui/prompt-input-persistent.js`, `src/ui/spinner.js`, `src/ui/turn-keys.js`, `test/prompt-input-render.test.js`, `test/turn-keys-visibility.test.js` |
