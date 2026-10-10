# BRIEF P1-16 — Streaming flicker: atomic frame transitions, no erase-to-end-of-screen

> Read first: `specs/2026-10-08-deep-dive-backlog/_shared-constraints.md` and
> `docs/deep-dive.md` § 6 (render layer), § 7, § 19.
>
> Relationship to P1-14: P1-14 Stage A is the STRUCTURAL fix (commit frontier +
> viewport-budgeted frame). This brief is the SYMPTOM fix for a daily-visible
> bug, scoped to the frame-transition mechanics — it does not build the frontier
> and does not change the layout. If Stage A has already landed, check whether
> each item below is still needed and mark the brief accordingly.

## Goal

The terminal flickers continuously while the agent streams — sometimes the whole
screen, sometimes only the reasoning block, sometimes only the prompt frame
(user-reported 2026-10-10; three variants). Root cause, verified in code: the
live-frame transition runs **once per stdout write**, erases with
**`ESC[0J` (erase to end of screen)**, and is **never wrapped in a synchronized
update**, so the terminal repaints the erased region dozens of times per second.

## Current behavior (facts, verified 2026-10-10)

- `src/ui/turn-keys.js:248-257` — `interceptedWrite()` runs for EVERY
  `process.stdout.write` while a turn is active: `live.hide()` → the agent's
  chunk → `repaint()` (`if (!finished)`). The spinner alone writes every 80 ms
  (`spinner.js:12 INTERVAL_MS = 80`, write at `:70`), and reasoning/text deltas
  arrive at 50–100/s — so each of those triggers a full frame transition.
- `hideFrame()` (`turn-keys.js:161-169`) emits
  `\x1B[${lastTopOffset}A` + `\r\x1B[0J\x1B8`: **`ESC[0J` erases from the frame
  top to the END OF THE SCREEN**, i.e. the agent-output area below it. That is
  why the WHOLE terminal blinks. (`visible` guards it, so the double call from
  `interceptedWrite`+`repaint()` is a no-op — that part is fine.)
- `drawFrame()` (`:115-159`, reservation at `:145-146`) writes
  `'\n'.repeat(reserveRows)` before saving the cursor — a scroll per repaint when
  the cursor sits near the bottom, then a move back up. Another visible jump.
- `repaint()` (`:240-243`) has NO early-out: it redraws even when the frame
  content (buffer/cursor/selection/footer) is byte-identical to the last draw.
- There is NO synchronized-output wrapper anywhere in `src/` (`2026` grep: zero
  real hits) and NO coalescing/throttling of repaints.
- `src/ui/thinking.js`'s in-place path (only while the block fits) rewrites the
  whole block per delta (`:198-206` via `clampedCursorUp`) — that is the
  "only the reasoning flickers" variant; `src/ui/prompt-input-persistent.js`
  `render()`/`erasePreviousBlock` (erase `\r\x1B[0J`) is the "only the prompt
  flickers" variant.
- Reference (grok-build, verified paths): `xai-grok-pager-render/src/render/draw.rs:500-516`
  wraps a frame in DEC 2026 (`BEGIN`/`END` at `:750-751`) and **skips it under
  tmux** (`:38`); `xai-ratatui-inline/src/terminal.rs:497-541` repaints by cell
  diff, never by erasing to the end of the screen.

## Required design (do not re-derive; implement this)

1. **Atomic frame transition (the main fix).** Wrap the whole
   `hide → agent chunk → draw` sequence performed by `interceptedWrite` in ONE
   synchronized update: `ESC[?2026h` … `ESC[?2026l`, emitted through
   `originalWrite` (never through the intercepted path), and **skipped entirely
   when `process.env.TMUX` is set** (reference `draw.rs:38`). The terminal then
   applies the transition in one paint instead of showing the erased state.
   Same wrapper for `prompt-input-persistent.js`'s `render()` and for
   `thinking.js`'s in-place rewrite (its append-only path is already single-write
   and needs no wrapper).
2. **Never erase to the end of the screen.** Replace `\r\x1B[0J\x1B8` in
   `hideFrame` with a bounded erase over the frame's OWN height: walk
   `lastTopOffset` rows up, `\r\x1B[K` each, end on the frame's top row
   (`ESC[K` per line, no `0J`). The agent output above must never be touched by a
   hide. Verify `erasePreviousBlock` in `prompt-input-persistent.js` under the
   same rule.
3. **Coalesce per tick.** A burst of writes inside one event-loop tick must
   produce ONE frame transition: mark the frame dirty and flush on
   `setImmediate` (or a microtask), instead of hiding/drawing per write. Keep the
   ordering guarantee: the agent's bytes are written before the frame is redrawn.
4. **Skip no-op repaints.** Cache the last composed frame payload
   (`buffer`/`cursor`/`selectedIndex`/footer → the exact string written); if the
   next payload is identical AND the frame is still visible, do nothing.
5. **Avoid the reservation scroll when unnecessary**: only write the
   `'\n'.repeat(reserveRows)` reservation when the frame would actually run past
   the last screen row (compare `lastTopOffset + layout.height` against
   `process.stdout.rows`); otherwise draw in place.
6. Keep every existing guarantee: the clamp (`src/ui/terminal-cursor.js`), the
   paste-burst coalescing (P0-4), the append-only latch (P0-1), the
   `TURN_INPUT_MAX_CHARS` bound (P1-13), the `onReady` `shutdown()` (P1-15) and
   the `clipLine` width rule.

## Tests to add

- Extend `test/prompt-input-render.test.js` (it already drives the emulator and
  pins `isTTY`/`rows`): while a frame is active, a burst of 50 intercepted writes
  inside one tick produces ONE `ESC[?2026h`/`ESC[?2026l` pair and at most one
  full frame redraw; a hide never emits `ESC[0J`; with `TMUX=1` no `2026` marker
  is emitted.
- `test/thinking-stream-flicker.test.js` (or extend
  `test/thinking-stream-append.test.js`): the fitting path emits at most one
  `2026` pair per delta and never `ESC[0J`.
- An unchanged frame (same buffer/cursor) does not re-emit the frame payload.
- Regression: the four UI suites keep their counts (render 20, thinking-append 9,
  turn-input 14, active-turn 1) and `npm test` exits 0.

## Constraints

- No new dependencies. Rendering stays inside `ui/` with the `C` palette.
- Do not change the layout/height budget (that is P2-18 / P1-14 Stage A), the
  frame CONTENT, or the cursor-positioning math.
- DEC 2026 must be emitted only around multi-row frame transitions, never around
  a single-line write.

## Verification

```
node --check src/ui/turn-keys.js src/ui/prompt-input-persistent.js src/ui/thinking.js
node --test test/prompt-input-render.test.js test/thinking-stream-append.test.js test/turn-input-cap.test.js
npm run lint && npm test
```
Baseline (2026-10-10): 441 tests / 431 pass / 0 fail / 10 env skips; lint exit 0.
Note: a `TEST`-level smoke of the flicker itself is impossible in CI — the
marker/erase assertions above are the proxy; say so in the spec.

## Docs sync (Rule 2)

- CHANGELOG `[Unreleased]` → Fixed: streaming no longer flickers (atomic DEC 2026
  frame transitions, bounded frame erase, per-tick coalescing, no-op repaint skip).
- `docs/architecture.md` ui/ row (frame transition contract);
  `docs/visual-identity.md` if the frame timing is documented there;
  `docs/deep-dive.md` § 6 + § 19 + § 21.1 P1-16; `features/terminal-ui.md`
  Change History.