# Spec: Surface an empty-stream notice when the model returns no content

| Field | Value |
|-------|-------|
| **ID** | `2026-09-02-empty-stream-line` |
| **Status** | `implemented` |
| **Phase/Context** | Agent loop / REPL feedback |
| **Related documents** | [PRD](../../docs/product.md), [Spec 2026-09-02-thinking-piscadinha](../2026-09-02-thinking-piscadinha/spec.md) |

## 1. Problem / Motivation

With `EMILE_DEBUG_THINKING=1` and a real `minimax-m3:free` OpenRouter
session, the diagnostic log shows a turn where the spinner ticks for
about 10 seconds and then `spinner.stop` is called with no
`thinking.start`, no `thinking.append`, no `thinking.end`, and no
`printAssistantResponse`. The user perceives this as "the thought
disappeared on the third prompt" — the screen blanks between the
spinner and the assistant response, with no visual signal.

The root cause is that the provider returned a stream with no
`choices[0].delta` content of any kind (no `reasoning_content`, no
`reasoning_details`, no `content`). The agent loop in
`src/agent/agent.js` reaches the `isFirstChunk` branch
(`agent.js:457-461`), calls `spinner.stop()`, and then the
`if (reasoningContent)` and `if (textContent)` branches are both
false, so nothing is written to the terminal before the active-turn
prompt is redrawn.

The user is left with a "blank line" where the spinner used to be,
and the only feedback is the lack of any output. That is confusing:
the user does not know whether the model is still working, whether
the response is empty, or whether the CLI is broken.

## 2. Goal

When the agent stream closes with no rendered content (no thinking,
no assistant response), write a single dim one-liner in the place
where the spinner was, so the user gets immediate visual feedback
that the turn produced nothing visible.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-----------|--------------------|
| RF-S01 | When `isFirstChunk` is `true` after the stream loop (no chunk arrived), AND `reasoningContent` is empty AND `textContent` is empty, the agent loop MUST write a single dim one-liner (e.g. `· (empty response)`) before the active-turn prompt is redrawn. | Must |
| RF-S02 | The one-liner MUST be in the muted palette (`C.muted`) to read as a status, not an error. | Must |
| RF-S03 | The notice MUST NOT be written when the user cancelled the turn (no false alarms for intentional exits). | Must |
| RF-S04 | The notice MUST NOT be written when the stream errored (the existing `Stream error: …` line is the user-facing signal). | Must |
| RF-S05 | The notice MUST NOT change the existing behaviour for turns that produced content (text, reasoning, or both). | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|--------|
| **Risk classification** | Low — purely additive output; no new tool, command, or model call. |
| **Assets/secrets** | None. |
| **Command execution / file writes** | None. |
| **Untrusted inputs** | None. |
| **Negative criteria** | No new dependencies, no new public API, no change to the spinner or to the `thinking.js` lifecycle. |

## 5. Out of Scope

- Showing partial chunks (e.g. "model returned only 2 chars"). A
  response with at least one character of `textContent` or
  `reasoningContent` already renders through the existing pipeline.
- Distinguishing "model returned nothing" from "model returned only
  whitespace". The existing `sanitizeAssistantOutput` already trims
  whitespace, so an all-whitespace response is treated as empty.
- Changing the spinner animation or the `thinking` lifecycle.

## 6. Acceptance Criteria

- **AC-01:** A reproduction that drives `runAgent` with a stream that
  yields no chunks at all (empty async generator) results in the
  terminal receiving a single `· (empty response)` line in the
  muted palette, between the spinner stop and the prompt redraw.
- **AC-02:** A reproduction that drives `runAgent` with a stream that
  yields only `content` chunks produces the normal assistant
  response box and NO `· (empty response)` line.
- **AC-03:** A reproduction that drives `runAgent` with a stream
  that yields only `reasoning_details` chunks produces the normal
  thinking block and NO `· (empty response)` line.
- **AC-04:** A reproduction where the user cancels the turn before
  any chunk arrives produces the existing `⏹ Turn canceled.` line
  and NO `· (empty response)` line.
- **AC-05:** A reproduction where the stream errors before any chunk
  arrives produces the existing `✗ Stream error: …` line and NO
  `· (empty response)` line.
- **AC-06:** `node --check` passes on every touched file.
- **AC-07:** `npm test` keeps the existing test surface green
  (`agent-reasoning-stream`, `turn-interrupt`, `prompt-input-render`).

## 7. References

- `src/agent/agent.js:457-461` — the `isFirstChunk` branch.
- `src/agent/agent.js:482-500` — the reasoning/text post-processing.
- `src/ui/spinner.js` — the spinner being stopped without follow-up
  output.
- The diagnostic log captured with `EMILE_DEBUG_THINKING=1` and
  `minimax-m3:free` on 2026-09-02.
