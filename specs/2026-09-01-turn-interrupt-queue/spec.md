# Spec: Turn interrupt and message queue

| Field | Value |
|-------|-------|
| **ID** | `2026-09-01-turn-interrupt-queue` |
| **Status** | `implemented` |
| **Phase/Context** | Agent loop / REPL interaction |
| **Related documents** | [PRD](../../docs/product.md), [Architecture](../../docs/architecture.md), [Code quality](../../docs/code-quality-and-security.md), [ADR-0001](../../docs/adr/0001-tech-stack-choice.md), [ADR-0003](../../docs/adr/0003-active-prompt-output-arbitration.md) |

---

## 1. Problem / Motivation

While the agent is executing a turn, the REPL input is gone: stdin is paused, typed keys go nowhere and Ctrl+C hits the global SIGINT handler that terminates the whole CLI. Users cannot cancel a long/wrong turn without losing the session, and cannot queue the next message while the agent works.

## 2. Goal

During an agent turn the user can (a) cancel the running turn with Esc or Ctrl+C — stopping the work gracefully, not the CLI — and (b) type a message and press Enter to queue it; queued messages run automatically as the next turns when the current one ends.

### 2026-09-01 regression follow-up

The persistent-prompt integration exposed three lifecycle regressions inside
the existing AC-04 scope: submitting a prompt hides the live writing field,
Tab toggles Plans mode instead of accepting an available slash-command
completion, and returning from `/switch` leaves stdin paused. This follow-up
restores the documented prompt behavior without changing queue ordering or
agent-loop semantics.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-----------|---------------------|
| RF-S01 | Esc and Ctrl+C during an agent turn MUST request a graceful stop of the current turn; the CLI process MUST NOT exit. | Must |
| RF-S02 | The agent loop MUST check the stop flag between loop iterations, while consuming stream chunks, and before/while executing tools, then stop cleanly. | Must |
| RF-S03 | On cancel, history MUST stay consistent: a partial assistant message with incomplete tool calls is dropped; text-only partial responses are kept; tool calls already announced but not executed get a `[canceled by user]` tool result so the next request remains valid. | Must |
| RF-S04 | Text typed during a turn and confirmed with Enter MUST be queued, with a visible `queued:` confirmation, and run automatically when the current turn ends. | Must |
| RF-S05 | Queued lines starting with `/` MUST be dispatched as slash commands between turns; other lines run as agent prompts. | Should |
| RF-S06 | Non-interactive runs (`emile "prompt"`) and resume flows MUST keep working unchanged (control is optional). | Must |
| RF-S07 | While an agent turn is running, the same full prompt frame used while idle MUST remain visible and accept cancel/queue input, including its placeholder, footer and slash-command autocomplete. | Must |
| RF-S08 | Tab MUST accept the highlighted slash-command match when autocomplete is open and MUST toggle Plans mode only when no match exists. | Must |
| RF-S09 | Nested raw-mode interactions such as `/switch` MUST have exclusive key ownership and MUST return stdin to the persistent prompt in a resumed, writable state. | Must |
| RF-S10 | During an active turn, the real terminal cursor MUST stay at the queue draft caret; spinner/reasoning/output writes MUST preserve the draft and redraw the frame without progressively erasing it. | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|----------|
| **Risk classification** | Medium — changes REPL lifecycle and agent loop flow; no new command execution, paths or network surface. |
| **Assets/secrets** | Not applicable — no new writes beyond existing session persistence. |
| **Command execution / file writes** | Existing tool gates unchanged; cancel does not bypass any gate. |
| **Untrusted inputs** | Queued text is the user's own input, rendered through existing sanitizing UI helpers and capped in length. |
| **Negative criteria** | Cancel MUST NOT kill the process, MUST NOT execute pending tool calls after the stop request, MUST NOT leave a tool_calls assistant message without matching tool results, and raw mode MUST always be restored. |

## 5. Out of Scope

- Refactoring every streaming surface into one centralized terminal renderer.
- Concurrent multi-turn execution (queue runs sequentially).
- Interrupting the in-flight HTTP request before the first chunk (the stop takes effect at the next check).

## 6. Acceptance Criteria

- **AC-01:** Given a running turn, when the user presses Esc or Ctrl+C, then the turn stops gracefully, a `Turn canceled` notice is shown and the CLI keeps running.
- **AC-02:** Given a cancel request mid-stream with partial text, when the loop stops, then the partial text is kept and no tool calls from that response are executed.
- **AC-03:** Given a cancel request mid-tool-batch, when the loop stops, then unexecuted tool calls get `[canceled by user]` results and history stays request-valid.
- **AC-04:** Given a running turn, when the user types a line and presses Enter, then it is queued and runs as the next turn after the current one ends. The standard full prompt frame stays visible while the turn runs; it is not replaced by a compact queue-only row.
- **AC-05:** `node --check` passes on touched files and the test suite stays green (new tests cover the control semantics, cancel paths and the live input row visibility).
- **AC-06:** Given an open autocomplete menu, when the user presses Tab, then the highlighted slash command fills the input; with no match, Tab still toggles Plans mode.
- **AC-07:** Given the persistent prompt dispatches `/switch`, when the picker completes or is canceled, then picker keystrokes are not also consumed by the prompt and the user can type immediately afterward.
- **AC-08:** Given slash-command autocomplete is visible, its selected suggestion MUST use a marker distinct from the input's `❯` glyph so it cannot look like a second writing field.
- **AC-09:** Given the thinking spinner or streamed reasoning writes while the user edits an active-turn draft, then those writes appear above the prompt, the full frame and draft remain intact, and the blinking terminal cursor remains at the draft caret rather than on the spinner.

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|--------|--------------------|
| Abandoned stream keeps the socket open | Resource leak | Abort the stream controller defensively when canceling mid-stream (best-effort). |
| Raw-mode listener conflicts with persistent prompt state | Broken keyboard | The current owner detaches before the next raw-mode surface starts; after nested cleanup, the persistent prompt reasserts raw mode, resumes stdin and attaches exactly one listener. |
| Queued `/` commands change config mid-drain | Surprise | Commands dispatch only between turns, in the idle REPL. |

## 8. References

- `src/cli.js` REPL loop, `src/agent/agent.js` loop and stream consumption, `src/ui/prompt-input-persistent.js` idle raw-mode handling and `src/ui/turn-keys.js` active-turn input.
- Existing fake-stream test harness in `test/agent-web.test.js`.
