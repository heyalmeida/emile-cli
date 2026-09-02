# Spec: Pinpoint the spinner/thinking flicker on the 3rd turn

| Field | Value |
|-------|-------|
| **ID** | `2026-09-02-thinking-piscadinha` |
| **Status** | `draft` |
| **Phase/Context** | REPL stdout arbitration / reasoning UX |
| **Related documents** | [PRD](../../docs/product.md), [Architecture](../../docs/architecture.md), [Visual identity](../../docs/visual-identity.md), [Spec 2026-09-02-thinking-during-active-turn](../2026-09-02-thinking-during-active-turn/spec.md) |

## 1. Problem / Motivation

The user reported a visual flicker between the `⠋ thinking...`
spinner and the prompt input on the **third** prompt in a session.
The `✻ Thinking…` header is never visible during the flicker; the
`Thought for Ns` summary and the streamed reasoning text only become
visible later, when a tool call (e.g. `● read …`) lands and the
cursor settles on a different line.

The internal state of the streaming (`startThinkingStream` /
`appendThinkingStream` / `endThinkingStream`) is correct — an
emulator-based reproduction across 3 turns shows the expected
header/content/summary counts on every turn. The bug is therefore a
**visual collision** between the spinner (`src/ui/spinner.js`) and
the thinking header (`src/ui/thinking.js`) on the active-turn frame.

## 2. Goal

Capture enough diagnostic information to identify the exact line where
the spinner overwrites the thinking header, so a follow-up fix can be
designed without guessing.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-----------|--------------------|
| RF-S01 | When `EMILE_DEBUG_RENDER` (or a new `EMILE_DEBUG_THINKING`) is set, every `process.stdout.write` issued by `src/ui/spinner.js` and `src/ui/thinking.js` MUST be logged to `process.stderr` with the pre-write cursor row, the chunk being written, and the post-write cursor row. | Must |
| RF-S02 | The diagnostic MUST be opt-in. The default behaviour MUST be unchanged. | Must |
| RF-S03 | The diagnostic MUST NOT add dependencies. | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|--------|
| **Risk classification** | Low — read-only diagnostic on a developer-only flag. |
| **Assets/secrets** | None — the log only shows the bytes being written to stdout, no model output, no user input. |
| **Command execution / file writes** | None. |
| **Untrusted inputs** | None. |
| **Negative criteria** | No new public API. The flag MUST be off by default. |

## 5. Out of Scope

- Fixing the visual flicker. The follow-up spec will own the fix
  once the diagnostic data has been collected.
- Changing the spinner implementation.
- Changing the thinking lifecycle.

## 6. Acceptance Criteria

- **AC-01:** Running the CLI with `EMILE_DEBUG_THINKING=1` produces a
  log on `stderr` for every spinner tick and every thinking-stream
  write, including cursor positions.
- **AC-02:** Running the CLI without the flag produces no diagnostic
  output and behaves identically to the current build.
- **AC-03:** `node --check` passes on every touched JS file.
- **AC-04:** `npm test` keeps the existing test surface green.

## 7. References

- `src/ui/spinner.js` — the animated `⠋ thinking...` indicator.
- `src/ui/thinking.js` — the `✻ Thinking…` header and re-render loop.
- `src/agent/agent.js:280-282` — the spinner is started before the
  API call.
- `src/agent/agent.js:382` — the spinner is stopped on the first
  stream chunk.
- The previous spec
  `specs/2026-09-02-thinking-during-active-turn` documents an
  earlier, unrelated investigation.
