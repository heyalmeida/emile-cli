# Spec: Never create, persist or resume an assistant message without content or tool_calls

| Field | Value |
|-------|-------|
| **ID** | `2026-10-09-assistant-null-poison` |
| **Status** | `implemented` |
| **Phase/Context** | Agent loop / session persistence integrity — deep-dive backlog wave 2, brief **P0-6** |
| **Related documents** | [Brief P0-6](../2026-10-08-deep-dive-backlog/briefs/p0-6-assistant-null-poison.md), [Shared constraints](../2026-10-08-deep-dive-backlog/_shared-constraints.md), [deep-dive § 10 / § 21.1 / § 22.3](../../docs/deep-dive.md), [Code Quality and Security](../../docs/code-quality-and-security.md), [feature: session-lifecycle](../../features/session-lifecycle.md), [feature: agent-loop](../../features/agent-loop.md) |

---

## 1. Problem / Motivation

**User-reported with screenshot + session JSON (2026-10-09). A dead stream
permanently kills the session.**

The loop is:

1. A stream error (or an empty response) leaves the accumulated turn with no
   text. `src/agent/agent.js:598-601` still builds
   `{ role: 'assistant', content: textContent || null }`, `tool_calls` is only
   attached when the stream produced some (`:610-613`), and the push at `:664`
   is **unconditional** on the error path — the stream `catch` (`:536-545`)
   prints "✗ Stream error: …" and falls through; only the cancel path (`:653`)
   breaks before pushing (F1).
2. `finalizeSessionTurn` persists that array (`src/cli.js:244-253`) through
   `saveSession` → `preparePersistedMessages`, which deletes
   `reasoning_content`/`reasoning_details` (`src/history.js:32-33`) — so a
   reasoning-only or error-only turn lands on disk as exactly
   `{"role":"assistant","content":null}` (F2), which is precisely what the
   user's session file contains.
3. Every subsequent request resends the whole history
   (`agent.js:292` `projectedMessages()` → `:362-365`), and the provider answers
   `400 messages[i] needs content or tool_calls`. That status is not in
   `RETRYABLE_STATUSES` (`src/api/client.js:11`) and does not match
   `isContextOverflowError` (`agent.js:44-52`), so compression never triggers
   and the error simply surfaces (F3).
4. The next user turn hits the same 400 **and appends another null-content
   assistant** — the transcript fills with the pair and the session is
   unrecoverable by the user. Their screenshot shows the double notice
   "✗ Stream error" + "· (empty response)" too, which is the dead flag in F5.

The load path offers no protection either: `getSessionRecord`
(`src/history.js:124-141`) returns `data.messages` with zero validation and
`resumeLoadedSession` (`src/cli.js:255-290`) consumes them directly (F4). So
even a session repaired by hand can be re-poisoned, and an already-poisoned
session can never be resumed.

grok-build treats this as an invariant, not a bug: history is sanitized and
validated **after every rewrite and on load**
(`xai-chat-state/src/compaction_utils.rs:1002-1100`,
`session/history_validator.rs:14-19`) (F6). emile has no such chokepoint.

## 2. Goal

A `{role:'assistant'}` message that carries neither non-empty `content` nor
`tool_calls` never exists in live history, never reaches disk, and never comes
back from disk — so one dead stream cannot poison a session, and an existing
poisoned session self-heals on resume.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-------------|---------------------|
| RF-S01 | `src/history.js` exports ONE pure predicate `isValidAssistantMessage(message)`: false **only** when `role === 'assistant'` AND `content` is null/undefined/empty-string AND `tool_calls` is missing or empty. All other messages are true. | Must |
| RF-S02 | Generation guard: `agent.js` does not push the assistant message at the normal push site when the predicate fails (an error-only or reasoning-only turn contributes nothing to the model and is invalid on the wire). | Must |
| RF-S03 | The cancel path keeps its current semantics (partial text kept, tool calls discarded) except that it must not push an assistant message that fails the predicate. | Must |
| RF-S04 | Persist guard: `preparePersistedMessages` drops assistant messages failing the predicate (belt-and-braces for checkpoint paths, `trimPersistedMessages` and any future generation site). | Must |
| RF-S05 | Load guard (self-heal): `getSessionRecord` filters assistant messages failing the predicate out of `data.messages` before returning, so poisoned sessions resume clean. | Must |
| RF-S06 | Read-time only: no session JSON file is rewritten or deleted in place; the next save naturally persists the clean projection. | Must |
| RF-S07 | `content: null` **with** `tool_calls` is valid and is preserved by all three sites — that shape is what providers themselves return (F7). | Must |
| RF-S08 | Consecutive `user` messages left behind by load filtering are acceptable and must not be merged or reordered (the 400 only ever names the assistant message). | Must |
| RF-S09 | The dead `streamErrored` flag is set in the stream `catch`, so a zero-chunk stream error no longer prints both "✗ Stream error" and "· (empty response)" (F5). | Must |
| RF-S10 | The three guards share the one predicate — no duplicated shape checks. | Must |
| RF-S11 | Retry, fallback, forced-compression, checkpoint and tool-pairing behavior are otherwise unchanged. | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|----------|
| **Risk classification** | **Medium** per [Code Quality and Security § 1](../../docs/code-quality-and-security.md) — a conversation-history integrity change spanning two modules (`agent.js`, `history.js`) and the persisted session contract. Not High: no command execution, no path resolution, no credentials, no new input surface. |
| **Assets/secrets** | The user's session transcripts in `.emile/history/<id>.json`. The fix only ever *drops* an empty assistant record; no message with content or tool results is removed, so user text and tool output are never lost. |
| **Command execution / file writes** | `saveSession` keeps writing the same file with the same shape; no new write path, no in-place rewrite of existing files. `resolveSafePath`/whitelist/dry-run gates untouched. |
| **Untrusted inputs** | The provider stream is untrusted input that shapes history. An error/empty payload previously produced an invalid record; now the shape check rejects it before it can enter the conversation. |
| **Negative criteria** | Must NOT: delete or rewrite session JSON files in place (RF-S06); drop an assistant message that carries `tool_calls` (F7); change cancel-path semantics beyond the invalid-assistant guard; touch the compression split logic or add orphan `tool`/`tool_calls` repair (**P1-11**); merge or reorder messages left by load filtering (RF-S08); add a dependency; suppress the "Stream error" notice itself (only the duplicate empty-response notice is removed). |

## 5. Out of Scope

Reported, not fixed (Rule 6.2):

- **Orphan `tool` / `tool_calls` repair after compression** — brief **P1-11**
  (`repairToolPairing`). Same invariant family, different class; not duplicated here.
- **The provider-side cause** of the empty/erroring stream — idle-timeout
  watchdog belongs to **P1-12**.
- **`saveSession` atomicity** (tmp+rename+fsync) — **P2-12**.
- **Merging consecutive `user` messages** left by load sanitization — accepted
  as valid on the chat-completions wire (RF-S08).
- **The `pendingToolCalls` checkpoint shape** — a `tool_pending` record's
  assistant-with-`tool_calls` is valid by F7 and is preserved.

## 6. Acceptance Criteria

- **AC-01:** Given a stream that throws after zero chunks, when the turn ends, then live `messages` contain **no** assistant message and nothing invalid is handed to the caller's persistence path.
- **AC-02:** Given a stream that yields reasoning-only deltas and then throws, then no `{role:'assistant', content:null}` record exists in live history, and `preparePersistedMessages` of that history yields no invalid assistant either.
- **AC-03:** Given a session JSON holding the user's exact pattern (assistant null → user "Prossiga" → assistant null → user "Prossiga" ×3), when `getSessionRecord` reads it, then no returned message fails `isValidAssistantMessage`, and a following turn completes without a 400-class error.
- **AC-04:** Given `{role:'assistant', content:null, tool_calls:[…]}`, then the message survives generation, persist and load unchanged.
- **AC-05:** Given a zero-chunk stream error, then stdout contains "Stream error" and **not** "(empty response)".
- **AC-06:** Predicate unit matrix: null content + no tool_calls → invalid; empty-string content + no tool_calls → invalid; null content + non-empty `tool_calls` → **valid**; non-empty string content → valid; `user`/`tool`/`system` roles → always valid; non-object entries → not treated as invalid assistants.
- **AC-07:** A fake provider that emulates the real rejection (`400 … needs content or tool_calls` for any assistant without content or tool_calls) accepts the history of **both** consecutive turns after an initial stream error — i.e. no poison loop.
- **AC-08:** Cancel-path semantics unchanged: partial text is still kept, tool calls are still discarded with the existing notices; `test/turn-interrupt.test.js`, `test/plans-compression.test.js`, `test/agent-reasoning-stream.test.js`, `test/session-reasoning.test.js`, `test/session-resilience.test.js` and `test/api-transports.test.js` keep passing.
- **AC-09:** The whole suite passes on Windows (`npm test` exits 0) and `npm run lint` reports 0 errors; `node --check` clean on both touched files.
- **AC-10:** Rule 2 docs sync: CHANGELOG `[Unreleased] → Fixed`; `docs/deep-dive.md` § 21.1 P0-6 marked applied (date + commit) and § 10 records the invariant; `features/session-lifecycle.md` + `features/agent-loop.md` Change History rows.

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|---------|--------------------|
| A provider that legitimately returns an empty assistant turn with `finish_reason: stop` now leaves no record at all. | The model sees the user message unanswered and may repeat itself. | Accepted and intended: an empty assistant is invalid on the wire, so keeping it guarantees the 400. Dropping it keeps the session usable; the user still sees the notice for the empty case (RF-S09 preserves it when no error occurred). |
| Dropping an assistant message could orphan the `tool` results that follow it. | Broken tool pairing → different 400 class. | Impossible by construction: the predicate only ever drops messages with **no** `tool_calls`, so no `tool_call_id` can reference them. AC-04 pins the tool_calls shape. |
| Load filtering removes a turn the user might want to see again. | Transcript looks shorter after resume. | Accepted: the record carries no content and no tool call — there is nothing to show. Files are never rewritten (RF-S06), so the original data stays on disk until the next save. |
| Consecutive `user` messages after filtering (the "Prossiga" ×3 case). | Provider behavior with repeated user turns. | Accepted per the brief (RF-S08): valid on chat-completions; the error text only ever names the assistant message. |
| `streamErrored` change could suppress the empty-response notice when it is still wanted. | Less visible empty reply. | The notice still prints for a genuinely empty, non-erroring stream — covered by the pre-existing `test/empty-stream-line.test.js` cases, which must keep passing. |

## 8. References

- `src/agent/agent.js` — generation site (`:598-613`, `:645-664`), stream catch (`:536-557`).
- `src/history.js` — `isValidAssistantMessage`, `preparePersistedMessages`, `trimPersistedMessages`, `getSessionRecord`, `saveSession`.
- `src/cli.js:244-290` — `finalizeSessionTurn` / `resumeLoadedSession` (consumers, unchanged).
- `test/empty-stream-line.test.js`, `test/turn-interrupt.test.js`, `test/session-resilience.test.js`, `test/session-reasoning.test.js` — behavior pinned by existing tests.
- `docs/deep-dive.md` § 10 (persistence/checkpoint/recovery), § 22.3 (compaction row, grok invariant), § 21.1 (P0-6).
