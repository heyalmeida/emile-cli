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

---

## Acceptance Criteria Verification Log

| AC | Status | Evidence |
|----|--------|----------|
| AC-01 | ✅ | Esc/Ctrl+C call `control.requestStop()` in `listenTurnKeys`; loop-start check prints `Turn canceled.` and breaks without exiting the process (unit + code path). |
| AC-02 | ✅ | `test/turn-interrupt.test.js` — mid-stream cancel keeps partial text `partial ` and never consumes `discarded`. |
| AC-03 | ✅ | `test/turn-interrupt.test.js` — tool-call stream cancel drops the assistant message; mid-batch cancel fills `call_b` with `[canceled by user]`. |
| AC-04 | ✅ | `listenTurnKeys.onLine` pushes sanitized lines to `pendingQueue`; cli.js drains them as the next turns after the current one ends. |
| AC-05 | ✅ | `node --check` all green; `npm test` 157/157. |
