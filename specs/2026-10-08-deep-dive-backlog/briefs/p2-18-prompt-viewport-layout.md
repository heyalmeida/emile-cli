# BRIEF P2-18 — Viewport-budgeted prompt block (tall drafts must not paint a stale frame)

> Read first: `specs/2026-10-08-deep-dive-backlog/_shared-constraints.md` and
> `docs/deep-dive.md` § 7.2–7.4, § 22.2 (the duplication family) — this is the
> third and last member of that family, and the only one still open.

## Goal

The prompt block grows with the draft: `buildPromptLayout` emits one row per
wrapped line with NO height budget (`src/ui/prompt-input-persistent.js` — only
width is clipped by `clipLine`). Pasting an 8.7 KB brief produces a ~200-row
block in a ~40-row terminal. P0-4 (`c839957`) clamps the erase so the frames can
no longer be re-painted into duplication, but the clamped erase cannot reach the
block top either, so on submit the user sees a PARTIAL remnant of the block (top
rows, no bottom border) still in scrollback (user-reported 2026-10-10,
`prompt-paste-text.txt` capture). Data is never lost — the submitted message was
the complete 8 681-char text (verified in `.emile/history/*.json`) — but the
screen reads as "my prompt got cut".

## Required design (do not re-derive; implement this)

1. **Hard height budget**: `buildPromptLayout` gains a `maxRows` input
   (`Math.max((process.stdout.rows || 24) - <chrome: menu + borders + footer>, 3)`).
   When `rows.length > maxRows`, render a WINDOW of the input rows centered on
   the cursor row, with explicit elision markers:
   `⌃ N earlier rows` above and `⌄ N later rows` below (dim). The cursor row must
   always be inside the window.
2. **Documented invariant**: the drawn block NEVER exceeds `stdout.rows - 1`
   rows, so `erasePreviousBlock` can always reach its own top — a stale frame
   becomes structurally impossible, not merely clamped.
3. **Submit path**: keep the divider print (`printUserMessage`) as-is; with the
   invariant above, the erase succeeds and no remnant is left.
4. `maxRows` must be recomputed per render from the live `stdout.rows` (resize
   between renders is normal). No change to `clipLine`, the wrap math, the
   cursor-column math or the burst coalescing.

## Tests to add (extend `test/prompt-input-render.test.js`)

- A 200-line draft with `rows = 24`: the block height is ≤ 23, the elision
  markers appear with the right counts, and the cursor row is inside the window.
- Scroll behavior: moving the cursor up/down re-windows (the visible slice
  changes, the total block height stays ≤ 23).
- `rows = 8` (tiny terminal): still ≤ 7 rows, no crash, cursor visible.
- Regression: all 20 existing render tests stay green (small drafts unchanged —
  no elision markers when it fits).
- Submit-after-tall-draft: no `\x1B[nA` beyond the clamp and no second frame
  (assert the render count).

## Constraints

- P0-4's coalescing/clamp semantics are frozen — this brief adds the height
  budget on top; do not re-tune the burst window.
- No new dependencies; keep the layout builder pure and exported for tests.

## Verification

`node --check src/ui/prompt-input-persistent.js && node --test test/prompt-input-render.test.js && npm run lint && npm test`
Baseline (2026-10-10): 387 tests / 377 pass / 0 fail / 10 env skips; lint 0 errors.

## Docs sync (Rule 2)

- CHANGELOG `[Unreleased]` → Fixed: the prompt block is height-budgeted and
  re-windows around the cursor, so a tall paste can no longer leave a partial
  frame on screen.
- `docs/deep-dive.md` § 22.2 (close the family) + § 7.4 + § 20 row;
  `features/terminal-ui.md` Change History; `docs/architecture.md` ui/ row if its
  "complete bounded frames" wording needs the height clause.