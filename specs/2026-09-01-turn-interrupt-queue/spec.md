# Spec: Turn interrupt and message queue

| Field | Value |
|-------|-------|
| **ID** | `2026-09-01-turn-interrupt-queue` |
| **Status** | `implemented` |
| **Phase/Context** | Agent loop / REPL interaction |
| **Related documents** | [PRD](../../docs/product.md), [Architecture](../../docs/architecture.md), [Code quality](../../docs/code-quality-and-security.md), [ADR-0001](../../docs/adr/0001-tech-stack-choice.md) |

---

## 1. Problem / Motivation

While the agent is executing a turn, the REPL input is gone: stdin is paused, typed keys go nowhere and Ctrl+C hits the global SIGINT handler that terminates the whole CLI. Users cannot cancel a long/wrong turn without losing the session, and cannot queue the next message while the agent works.

## 2. Goal

During an agent turn the user can (a) cancel the running turn with Esc or Ctrl+C — stopping the work gracefully, not the CLI — and (b) type a message and press Enter to queue it; queued messages run automatically as the next turns when the current one ends.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-----------|---------------------|
| RF-S01 | Esc and Ctrl+C during an agent turn MUST request a graceful stop of the current turn; the CLI process MUST NOT exit. | Must |
| RF-S02 | The agent loop MUST check the stop flag between loop iterations, while consuming stream chunks, and before/while executing tools, then stop cleanly. | Must |
| RF-S03 | On cancel, history MUST stay consistent: a partial assistant message with incomplete tool calls is dropped; text-only partial responses are kept; tool calls already announced but not executed get a `[canceled by user]` tool result so the next request remains valid. | Must |
| RF-S04 | Text typed during a turn and confirmed with Enter MUST be queued, with a visible `queued:` confirmation, and run automatically when the current turn ends. | Must |
| RF-S05 | Queued lines starting with `/` MUST be dispatched as slash commands between turns; other lines run as agent prompts. | Should |
| RF-S06 | Non-interactive runs (`emile "prompt"`) and resume flows MUST keep working unchanged (control is optional). | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|----------|
| **Risk classification** | Medium — changes REPL lifecycle and agent loop flow; no new command execution, paths or network surface. |
| **Assets/secrets** | Not applicable — no new writes beyond existing session persistence. |
| **Command execution / file writes** | Existing tool gates unchanged; cancel does not bypass any gate. |
| **Untrusted inputs** | Queued text is the user's own input, rendered through existing sanitizing UI helpers and capped in length. |
| **Negative criteria** | Cancel MUST NOT kill the process, MUST NOT execute pending tool calls after the stop request, MUST NOT leave a tool_calls assistant message without matching tool results, and raw mode MUST always be restored. |

## 5. Out of Scope

- Live echo/redraw of the typed buffer during agent output (requires a centralized renderer).
- Concurrent multi-turn execution (queue runs sequentially).
- Interrupting the in-flight HTTP request before the first chunk (the stop takes effect at the next check).

## 6. Acceptance Criteria

- **AC-01:** Given a running turn, when the user presses Esc or Ctrl+C, then the turn stops gracefully, a `Turn canceled` notice is shown and the CLI keeps running.
- **AC-02:** Given a cancel request mid-stream with partial text, when the loop stops, then the partial text is kept and no tool calls from that response are executed.
- **AC-03:** Given a cancel request mid-tool-batch, when the loop stops, then unexecuted tool calls get `[canceled by user]` results and history stays request-valid.
- **AC-04:** Given a running turn, when the user types a line and presses Enter, then it is queued with a visible notice and runs as the next turn after the current one ends.
- **AC-05:** `node --check` passes on touched files and the test suite stays green (new tests cover the control semantics and cancel paths).

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|--------|--------------------|
| Abandoned stream keeps the socket open | Resource leak | Abort the stream controller defensively when canceling mid-stream (best-effort). |
| Raw-mode listener conflicts with promptInput state | Broken keyboard | Listener restores the previous raw mode and pauses stdin on cleanup; only one listener at a time. |
| Queued `/` commands change config mid-drain | Surprise | Commands dispatch only between turns, in the idle REPL. |

## 8. References

- `src/cli.js` REPL loop, `src/agent/agent.js` loop and stream consumption, `src/ui/prompt-input.js` raw-mode handling.
- Existing fake-stream test harness in `test/agent-web.test.js`.
