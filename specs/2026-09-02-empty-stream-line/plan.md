# Plan — Surface an empty-stream notice

## Approach

Add a single conditional write in `src/agent/agent.js`, inside the
existing `isFirstChunk` branch that already calls `spinner.stop()`.
The condition is `isFirstChunk && !control?.shouldStop() && !streamCanceled`
to make sure we only render the notice for empty-but-not-cancelled
turns. The existing `catch (streamErr)` branch already writes a
`Stream error: …` line, so we are guaranteed no notice when the
stream errored before the loop body reached the
`isFirstChunk` check (the `catch` short-circuits to its own
write).

The one-liner text is `· (empty response)`, in `C.muted`, prefixed
with a section gap (`GAP.section`) so it respects the existing
vertical rhythm (one blank line above, matching the thinking and
response blocks).

## Files to change

| File | Change |
|------|--------|
| `src/agent/agent.js` | Add the notice write in the `isFirstChunk` branch. |
| `test/empty-stream-line.test.js` | New test covering AC-01..AC-05. |
| `specs/2026-09-02-empty-stream-line/tasks.md` | Checklist. |
| `CHANGELOG.md` | `### Fixed` entry. |

## Decisions

- The notice uses the bullet `·` (U+00B7) instead of `⠋` (the
  spinner frame) so the user can tell the difference between "still
  working" and "finished with no content".
- The notice is a one-shot line; it does not try to compete with
  the `↳ N tools` header (which is rendered by
  `printAssistantResponse` when there is content).
- We do not add a new ADR or a new visual identity row. The notice
  is a small status line that fits the existing palette.

## Verification

- `node --check` on every touched file.
- `npm test` (full suite) must pass.
- The new `test/empty-stream-line.test.js` must pass.
- Manual: in a real session, run a prompt that the model answers
  with an empty response (rare but possible); the `· (empty
  response)` line should appear in the muted palette.
