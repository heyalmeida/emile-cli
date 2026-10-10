# BRIEF P0-6 — Never persist or resume an assistant message without content or tool_calls

> Read first: `specs/2026-10-08-deep-dive-backlog/_shared-constraints.md` and `docs/deep-dive.md` § 22.3 (compaction row — the "validate at every history rewrite" invariant) and § 10.

## Goal

A stream that errors or returns empty pushes an assistant message with
`content: null` and no `tool_calls` (`src/agent/agent.js:598-601, 664`). The
provider rejects it with `400 messages[i] needs content or tool_calls` on EVERY
subsequent request — the error is not retryable and not an overflow, so the
session is permanently dead: the user types "Prossiga", gets the same 400, and
the transcript fills with `{"role":"assistant","content":null}` pairs (user-
reported 2026-10-09, screenshot evidence). Fix the generation site AND
sanitize at both history boundaries (persist + load), so existing poisoned
sessions self-heal on resume.

## Current behavior (facts, verified 2026-10-09)

- Generation: `agent.js:598-601` builds `{ role:'assistant', content:
  textContent || null }`; tool_calls only added when present (`:610-613`).
  The push at `:664` is unconditional on the error path — the `catch`
  (`:535-545`) prints "Stream error" and falls through; only the CANCEL path
  (`:653`) breaks before pushing.
- Persistence projection: `history.js:32` deletes `reasoning_content` — a
  reasoning-only turn becomes exactly `{"role":"assistant","content":null}`
  on disk (matches the user's session file).
- Poison loop: every request resends the whole history (`agent.js:292`
  `projectedMessages()` → `:362`); 400 is not in `RETRYABLE_STATUSES`
  (`client.js:11`) and does not match `isContextOverflowError`, so it
  surfaces and the next turn repeats. `finalizeSessionTurn` persists the
  poisoned array (`cli.js:241-250`).
- Double-notice bug: `streamErrored` (`agent.js:445`) is declared and read
  (`:551`) but NEVER set — after a zero-chunk stream error the user sees
  BOTH "✗ Stream error: …" and "· (empty response)" (visible in the
  screenshot).
- Load path: `getSessionRecord` (`history.js:124-141`) returns
  `data.messages` with NO validation; `resumeLoadedSession` (`cli.js:252-287`)
  consumes them directly.
- Reference invariant (grok-build): history is sanitized/validated after
  every rewrite and on load (`xai-chat-state/src/compaction_utils.rs:1002-1100`;
  `session/history_validator.rs:14-19`).

## Required design (do not re-derive; implement this)

1. **Do not create the poison** — at `agent.js:664`, skip the push when the
   assistant message has NO non-empty `content` AND NO `tool_calls` (a
   reasoning-only or error-only turn contributes nothing to the model and is
   invalid on the wire). Keep pushing assistant messages with `content: null`
   WHEN `tool_calls` are present (that shape is valid and is what providers
   themselves return).
2. **Sanitize at persist** — in `preparePersistedMessages` (`history.js:22`),
   drop assistant messages failing the same predicate (belt-and-braces:
   covers checkpoint paths and any future generation site).
3. **Sanitize at load (self-heal)** — in `getSessionRecord`, filter the same
   invalid assistant messages from `data.messages` before returning.
   Consecutive `user` messages left behind are acceptable on the
   chat-completions wire (the 400 only ever names the assistant message —
   verified against the user's error text); do NOT merge them.
4. **Fix the dead flag** — set `streamErrored = true` in the stream `catch`
   (`agent.js:535-545`) so the "· (empty response)" notice (`:551-556`) no
   longer double-prints after a real error.
5. One exported pure helper `isValidAssistantMessage(message)` (place in
   `history.js`, import from `agent.js` if needed) — ONE predicate for all
   three sites.

## Tests to add (new file `test/history-sanitize.test.js` + agent cases)

- Unit predicate: `null` content + no tool_calls → invalid; `null` content +
  tool_calls → valid; empty-string content + no tool_calls → invalid (same
  class); string content → valid.
- `preparePersistedMessages` drops the invalid assistant, keeps the
  tool_calls-with-null-content one.
- `getSessionRecord` on a fixture JSON containing the user's exact poison
  pattern (assistant null / user "Prossiga" ×3) returns messages with NO
  invalid assistant.
- Integration: fake `createCompletion` that throws after zero chunks (and a
  variant that yields reasoning-only deltas then throws); run `runAgent`;
  assert the live `messages` and the persisted session contain no invalid
  assistant; a SECOND turn then completes without the 400-class error.
- Double-notice: zero-chunk error prints "Stream error" and NOT
  "(empty response)" (capture stdout; pattern: existing agent tests).

## Constraints

- Do NOT touch the compression split logic (`compression.js`) — orphan
  tool/tool_call repair is brief P1-11; this brief owns the empty-assistant
  class only.
- Do NOT rewrite session files on disk in place; sanitization is read-time
  (the next save persists the clean projection).
- Cancel-path behavior (`:653-661`: partial text kept, tool calls discarded)
  unchanged.
- No new dependencies.

## Verification

`node --check src/agent/agent.js src/history.js && node --test test/history-sanitize.test.js && npm run lint && npm test`
Baseline: 324 tests / 0 fail / 10 env skips; lint 0 errors; `npm test` exit 0.

## Docs sync (Rule 2)

- CHANGELOG `[Unreleased]` → Fixed: assistant messages without content or
  tool_calls no longer poison a session (generation guard + persist/load
  sanitize — existing corrupted sessions self-heal on resume); stream-error
  no longer double-prints the empty-response notice.
- `docs/deep-dive.md` § 10 + § 22.3: mark applied; § 20 pattern row "tool-pair
  / history validation" if present after P1-11, else add the invariant note.
- `features/session-lifecycle.md` and `features/agent-loop.md`: Change History
  rows.
