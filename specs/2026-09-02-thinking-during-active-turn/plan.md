# Plan — Thinking stream survives the active-turn prompt arbitration

## Approach

Refine the `live.hideFrame()` in `src/ui/turn-keys.js` so it erases
**only the prompt frame** instead of "from the current cursor row to
the end of the screen". The fix is the exact inverse of `drawFrame`:

1. `drawFrame` writes `layout.height` lines (border + input rows +
   border + optional footer) ending each with `\n`. After writing, it
   moves the cursor up `layout.height - (inputRowIndex + cursorRow)`
   rows and right `cursorCol + 2` columns, ending on the input caret.
2. `hideFrame` should:
   - move the cursor up `lastTopOffset` rows (to the top border row);
   - for each of the `layout.height` rows, write `\r\x1B[K` (erase
     that row) and `\n` (advance);
   - move the cursor up `layout.height` rows to return to the top
     border position;
   - issue `\r` and `ESC8` to restore the saved agent cursor.

The current implementation uses `\x1B[0J` which is "erase to end of
screen" — that is what sweeps through the thinking block above. The
new implementation uses a bounded per-line erase that matches the
exact rows `drawFrame` painted.

`layout.height` is recorded in `drawFrame` as `lastTopOffset` is
already; we add a sibling `lastFrameHeight` and use both in `hideFrame`.

## Files to change

| File | Change |
|------|--------|
| `src/ui/turn-keys.js` | Track `lastFrameHeight` alongside `lastTopOffset`; rewrite `hideFrame` to erase exactly `lastFrameHeight` rows. |
| `test/thinking-during-active-turn.test.js` | New test that drives the exact reproduction and asserts the terminal grid contains every thinking row. |
| `specs/2026-09-02-thinking-during-active-turn/tasks.md` | Checklist. |
| `CHANGELOG.md` | New `### Fixed` entry. |
| `docs/adr/0003-active-prompt-output-arbitration.md` | Add a short "Refinement (2026-09-02)" note pointing to the new test. |

## Decisions

- The fix is **local to `hideFrame`** — we do not change `drawFrame`,
  the prompt layout, the thinking renderer, or the agent loop. This
  keeps the blast radius small and the diff reviewable.
- We do **not** add a new ADR. The decision is a refinement of the
  existing ADR-0003 ("hide the frame by clearing exactly the rows we
  drew"), not a new architectural direction.
- The new test is the regression gate. It must fail on the current
  code and pass on the fixed code, so the bug cannot silently come
  back.

## Verification

- `node --check` on every touched file.
- `npm test` (full suite) must pass.
- The new `test/thinking-during-active-turn.test.js` must pass.
- Manual: drive the CLI with `minimax-m3:free` via OpenRouter in plans
  mode and confirm the thinking block streams visibly.
