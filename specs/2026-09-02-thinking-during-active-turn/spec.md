# Spec: Thinking stream survives the active-turn prompt arbitration

| Field | Value |
|-------|-------|
| **ID** | `2026-09-02-thinking-during-active-turn` |
| **Status** | `draft` |

> **Note (2026-09-02):** the user reported the live thinking stream was
> not rendering for `minimax-m3:free` via OpenRouter. The reproduction
> in the project's ANSI terminal emulator (used by
> `test/thinking-during-active-turn.test.js`) did **not** capture the
> bug — the test passes on the current code as well as on a candidate
> fix. The candidate fix (per-line erase in `live.hideFrame`) was
> reverted to avoid changing critical redraw math without evidence.
> The spec, plan, tasks and regression test are kept here so the
> problem is documented and a future reproduction can land the right
> fix. The next step requires a real-terminal capture (`script -c
> "node bin/emile.js" /tmp/s.log`) to see the exact bytes the agent
> emits through `listenTurnKeys`. |
| **Phase/Context** | REPL stdout arbitration / reasoning UX |
| **Related documents** | [PRD](../../docs/product.md), [Architecture](../../docs/architecture.md), [Visual identity](../../docs/visual-identity.md), [ADR-0003](../../docs/adr/0003-active-prompt-output-arbitration.md), [Spec 2026-09-01-turn-interrupt-queue](../2026-09-01-turn-interrupt-queue/spec.md) |

## 1. Problem / Motivation

With the active-turn prompt arbitration in place (ADR-0003), the live
thinking stream from the agent no longer renders to the terminal. The
chat is silent while the model is reasoning; the user sees the spinner
or the tool list, then the final response box. The thinking content
**does** reach the conversation history (`messages.at(-1).reasoning_content`
is correct) and **does** reach the terminal in the absence of the
arbitration (verified with a print-only reproduction). The bug is
specifically in the interaction between `src/ui/turn-keys.js`
(`live.hide()` / `live.drawFrame()`) and `src/ui/thinking.js`
(`appendThinkingStream()`).

### Root cause

`listenTurnKeys` wraps `process.stdout.write` so that every agent
output is bracketed by `live.hide()` and `repaint()`. `live.hide()`
issues the sequence `\r\x1B[0J\x1B8`:

- `\x1B[0J` erases **from the current cursor row to the end of the
  screen**.
- `ESC8` restores the cursor to the saved agent-output position.

`appendThinkingStream()` is **not** append-only. It moves the cursor
up `oldTotal` lines, re-renders the header and the muted content rows,
and leaves the cursor at the bottom of the block. While doing that it
passes through rows where earlier delta content lived. When the next
`interceptedWrite` fires (e.g. for the next delta, the spinner tick, or
the next response chunk), `live.hide()` issues `\x1B[0J` from the new
cursor position, which is **below the thinking block**. The erase
therefore sweeps through the thinking block and deletes it. Only the
**last** write before `repaint()` survives; everything before is wiped.

Reproduction (stdout-instrumented, terminal-shape grid 80x24):

```
0|
1|  ✻ Thought for 1s        <- only the last line survives
2|  The user asks            <- only the last delta survives
3|
4|  ╭─ emile ────────────
5|
6|    Here is the plan.
```

The expected output should contain the header `✻ Thinking…`, every
intermediate delta, and the final `✻ Thought for Ns` summary, with the
prompt redrawn **below** the block (not on top of it).

## 2. Goal

Make the live thinking stream render correctly when `listenTurnKeys` is
in charge of stdout arbitration, without regressing the prompt
redraw math, the `endThinkingStream` finalization, or the
`/thinking` collapsed one-liner.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-----------|--------------------|
| RF-S01 | During an active agent turn, every `appendThinkingStream` delta MUST leave a visible row in the terminal. | Must |
| RF-S02 | The header `✻ Thinking…` MUST be visible while the stream is in progress. | Must |
| RF-S03 | The final `✻ Thought for Ns` summary MUST be visible after `endThinkingStream`. | Must |
| RF-S04 | The active-turn prompt frame MUST continue to be redrawn below the agent output, with the real caret on the input row. | Must |
| RF-S05 | The fix MUST NOT change the `printThinking` post-stream render (used by the history replay and the persistence projection). | Must |
| RF-S06 | The fix MUST NOT change the collapsed `/thinking` one-liner. | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|--------|
| **Risk classification** | Medium — touches the active-turn stdout arbitration that owns the prompt redraw math; a bad fix can re-introduce the cursor-drift and redraw-drift regressions closed by the `prompt-input-render` test suite. |
| **Assets/secrets** | None. |
| **Command execution / file writes** | None. |
| **Untrusted inputs** | None. |
| **Negative criteria** | No new file writes, no new public API, no new dependencies. The new `hide` sequence MUST be the exact inverse of the `draw` sequence (same number of rows cleared as drawn). |

## 5. Out of Scope

- Changing how `appendThinkingStream` updates the block (it stays
  cursor-up / rewrite / cursor-down — that is what makes the live
  rewrap work).
- Changing the height of the prompt frame.
- Adding a per-render tracker for the agent-output cursor position.
- A new ADR. The change is a refinement of the existing ADR-0003.

## 6. Acceptance Criteria

- **AC-01:** A reproduction that drives `runAgent` with two
  `reasoning_details` deltas plus a `content` delta, while
  `listenTurnKeys` is installed, produces a terminal grid in which the
  header `✻ Thinking…` is present, both deltas are present, and the
  final `✻ Thought for Ns` is present (in that order, top to bottom).
- **AC-02:** The prompt frame is drawn below the thinking block (the
  prompt's top border is at a strictly greater row than the last
  thinking row).
- **AC-03:** `node --check` passes on every touched JS file.
- **AC-04:** `npm test` keeps the existing test surface green
  (`prompt-input-render`, `turn-keys-visibility`, `agent-reasoning-stream`,
  `persistent-queue`).
- **AC-05:** A new regression test, `test/thinking-during-active-turn.test.js`,
  fails on the previous code and passes on the fixed code.

## 7. References

- `src/ui/turn-keys.js` — `createLiveInput`, `drawFrame`, `hideFrame`.
- `src/ui/thinking.js` — `startThinkingStream`, `appendThinkingStream`,
  `endThinkingStream`.
- `src/agent/agent.js:401`, `:416` — the two `startThinkingStream` call
  sites (legacy `reasoning_content` and structured `reasoning_details`).
- `docs/adr/0003-active-prompt-output-arbitration.md` — the existing
  decision whose implementation is being refined.
