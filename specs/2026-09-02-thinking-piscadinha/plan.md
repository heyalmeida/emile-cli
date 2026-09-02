# Plan — Pinpoint the spinner/thinking flicker

## Approach

Wrap the `process.stdout.write` calls inside `src/ui/spinner.js` and
`src/ui/thinking.js` with a small helper that, when the env var
`EMILE_DEBUG_THINKING` is set, logs to `process.stderr`:

- a tag identifying the source (`spinner` or `thinking`),
- the pre-write cursor row (tracked by a counter in the helper that
  mirrors what the previous write did — `\n` increments, `\r` resets
  to column 0, ESC sequences adjust by their parameter),
- the chunk being written (truncated to 200 chars),
- the post-write cursor row.

The helper is local to each file (a small inline IIFE) so the
production code path is unchanged. A single source of truth would
create cross-module coupling that is not worth it for a developer
diagnostic.

## Files to change

| File | Change |
|------|--------|
| `src/ui/spinner.js` | Add an opt-in stderr log around the two `process.stdout.write` calls (the tick and the `stop`). |
| `src/ui/thinking.js` | Add an opt-in stderr log around the four `process.stdout.write` call sites (`start`, `append`, `end`, `print`). |
| `specs/2026-09-02-thinking-piscadinha/tasks.md` | Checklist. |
| `CHANGELOG.md` | `### Added` entry mentioning the diagnostic. |

## Decisions

- The flag is opt-in (`EMILE_DEBUG_THINKING=1`) and matches the
  pattern already used by `EMILE_DEBUG_RENDER` in
  `src/ui/prompt-input-persistent.js`.
- The log goes to `process.stderr` so it never collides with the
  rendered output.
- The diagnostic is removed once the real fix lands (the follow-up
  spec will own that work).

## Verification

- `node --check` on every touched file.
- `npm test` stays green.
- Manual: `EMILE_DEBUG_THINKING=1 node bin/emile.js`, send three
  prompts, capture `stderr` to a file.
