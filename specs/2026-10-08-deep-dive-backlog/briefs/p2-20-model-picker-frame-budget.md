# BRIEF P2-20 — The /model picker frame: last renderer without a height budget

> Read first: `specs/2026-10-08-deep-dive-backlog/_shared-constraints.md`,
> `docs/deep-dive.md` § 19, and the frame-transition contract now documented in
> `docs/architecture.md` (ui/ row) after P1-16.
>
> Measured by the P1-16 executor and re-verified 2026-10-10. Report-only in that
> session; this brief is the follow-up.

## Goal

`src/ui/model-picker.js` is the last renderer that (a) has NO height budget, and
(b) writes its frame row by row with no synchronized update. Everything else
(`turn-keys`, `prompt-input-persistent`, `thinking`, responses, tool grids) now
obeys the budget + atomic-transition rules.

## Current behavior (verified 2026-10-10)

- Frame is emitted **one row per write**: `process.stdout.write('\r\x1B[K' +
  line + '\n')` per row — max write length 82 chars (a single row), ~34 writes to
  open, repaint on one keystroke and tear down, and **0 DEC 2026 markers**.
- The teardown is a per-row loop: `for (let index = 0; index < lastRenderedHeight;
  index++)` (`model-picker.js:157-165`), one write each.
- The climb IS clamped (`writeCursorUp(lastRenderedHeight)`, `:149` — P2-19), but
  the frame is NOT bounded: the picker can render up to **11 rows** (header +
  search + up to 7 result rows + a conditional `Showing X–Y of N` + help line), so
  on a small terminal it can exceed the viewport → a stale-frame remnant is
  possible (the P2-18 family, in its last member).
- The picker owns stdout exclusively while open, so there is no cross-module
  arbitration to respect (it is NOT under the ADR-0003 lease).

## Required design (do not re-derive; implement this)

1. **Compose, then emit once.** Collect the picker's rows into one buffer with the
   climb embedded (the lease-rule form: a climb must stay in the same write as the
   rows it belongs to) and emit it through `wrapSynchronizedOutput` from
   `src/ui/commit-frontier.js` (which already carries the TTY + tmux guards).
2. **Bound the frame** with the same budget rule the prompt uses:
   `promptFrameBudget()` (`prompt-input-persistent.js`, exported) or an equivalent
   `Math.max((process.stdout.rows || 24) - 1, 1)`. When the result list must be
   trimmed, reuse the established elision vocabulary from
   `docs/visual-identity.md` (`⌃ N earlier rows` / `⌄ N later rows`, `C.dim`, one
   row per side) and keep the focused row inside the window.
3. **Fold the teardown loop** into one bounded chunk using the same row-walk the
   other two frames now use (`\r\x1B[K` per row + the clamped climb), never
   `ESC[0J`.
4. Keep the existing behavior intact: incremental search, at most seven visible
   results, accent focus marker, muted metadata/help, ↑/↓ navigation, Enter
   selection, Esc cancellation, sanitized/bounded labels.

## Tests to add (extend the existing suites; the emulator already consumes the DEC 2026 pair)

- A burst of keystrokes in one screen → the frame is emitted as ONE synchronized
  write (one `2026` pair), not one per row.
- With `rows = 12` and a long result list: `lines.length <= rows - 1`, the elision
  markers carry the right counts, and the focused row is inside the window.
- The teardown emits no `ESC[0J` and climbs no more than the frame's own rows.
- `TMUX=1` and a non-TTY stdout → no `2026` marker (frame still drawn on a TTY-less
  path only if that is the current behavior; assert what is true today and keep it).
- Regression: `test/model-picker*.test.js` if present, `test/prompt-input-render.test.js`
  (39) and the other UI suites keep passing.

## Verification

```
node --check src/ui/model-picker.js
node --test test/model-picker*.test.js test/prompt-input-render.test.js
npm run lint && npm test
```
Baseline (2026-10-10): 477 tests / 467 pass / 0 fail / 10 env skips; lint exit 0.

## Docs sync (Rule 2)

- CHANGELOG `[Unreleased]` → Fixed: the /model picker frame is height-budgeted and
  emitted as one synchronized write with a bounded teardown.
- `docs/visual-identity.md` (Model picker row + the elision-marker vocabulary now
  covering it); `docs/deep-dive.md` § 19 + § 21.1 P2-20;
  `features/terminal-ui.md` Change History.