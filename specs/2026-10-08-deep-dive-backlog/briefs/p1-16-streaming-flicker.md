# BRIEF P1-16 — Streaming flicker: atomic transition, bounded erase, per-tick coalescing

> Read first: `specs/2026-10-08-deep-dive-backlog/_shared-constraints.md`,
> `docs/deep-dive.md` § 6 (render layer) and § 19.
>
> **Re-verified 2026-10-10 against the post-Stage-A tree.** P1-14 Stage A already
> shipped: `src/ui/commit-frontier.js` (`wrapSynchronizedOutput` /
> `shouldEmitSynchronizedOutput` — DEC 2026 with the **TTY + tmux** guards), the
> clamp returning 0 on a non-TTY (`terminal-cursor.js:38`), the persistent prompt
> frame as ONE synchronized write (`prompt-input-persistent.js:573`), and
> finalized blocks committed once. **Do NOT redo any of that.** What remains is
> the ACTIVE-TURN frame in `turn-keys.js` plus one erase in the persistent prompt.

## Goal

The terminal still flickers while the agent streams (user-reported 2026-10-10;
variants: whole screen, reasoning only, prompt only). Stage A removed the
duplication family and wrapped two paths, but the active-turn frame still runs a
full transition per stdout write and erases with `ESC[0J`.

## Current behavior (facts, re-verified 2026-10-10)

- `src/ui/turn-keys.js:260-269` — `interceptedWrite()` runs for EVERY
  `process.stdout.write` while a turn is active: `live.hide()` → the agent's
  chunk → `repaint()` (unless finished). The spinner writes every 80 ms
  (`spinner.js:12 INTERVAL_MS = 80`, write at `:70`) and deltas arrive at
  50–100/s, so each of those triggers a full transition.
- `hideFrame()` (`:171-181`) emits a **clamped** climb
  (`clampedCursorUp(lastTopOffset)`, `:176`) followed by
  `'\r\x1B[0J\x1B8'` (`:177`) — `ESC[0J` is **erase from the frame top to the END
  OF THE SCREEN**. This is what makes the whole terminal blink; the clamp fixed
  the climb, not the erase.
- `drawFrame()` (`:117-169`) reserves rows with
  `'\n'.repeat(reserveRows)` (`reserveRows = layout.height + 1`, `:150-151`) — a
  scroll per repaint when the cursor sits near the bottom.
- `repaint()` (`:252-255`) has NO early-out: it hides and redraws even when the
  frame payload is byte-identical to the last draw.
- **`turn-keys.js` does not use the DEC 2026 helper at all** (no import of
  `commit-frontier.js`) — so the `hide → chunk → draw` sequence shows every
  intermediate state. Stage A's deviation note says its frame is "already atomic
  under the lease": that is true per WRITE, not per TRANSITION (three writes).
- `src/ui/prompt-input-persistent.js:507-511` — `eraseChunk()` still returns
  `\r\x1B[0J` (harmless while the frame is the last thing on screen, same class).
- `src/ui/model-picker.js` writes its frame row by row (Stage A clamped only its
  climb). REPORT what wrapping would take; do not restructure it here.

## Required design (do not re-derive; implement this)

1. **Atomic transition for the active-turn frame.** Import
   `wrapSynchronizedOutput` / `shouldEmitSynchronizedOutput` from
   `./commit-frontier.js` and wrap the WHOLE `hide → agent chunk → draw` sequence
   performed by `interceptedWrite` in ONE `ESC[?2026h` … `ESC[?2026l` pair — the
   terminal then applies the transition in one paint. The markers must go through
   `writeDirect`/`originalWrite`, never through the intercepted path (no
   recursion), and the helper already handles `TMUX` and a non-TTY stdout.
2. **Bounded erase.** Replace `'\r\x1B[0J\x1B8'` in `hideFrame` with an erase
   limited to the frame's OWN height: walk `lastTopOffset` rows up, `\r\x1B[K`
   each, then `ESC8`. The agent output above must never be inside an erase.
3. **Per-tick coalescing.** A burst of writes inside one tick produces ONE
   transition: mark the frame dirty and flush it on `setImmediate` (or a
   microtask), instead of hiding/drawing per write. Preserve the ordering
   guarantee: the agent's bytes are written BEFORE the frame is redrawn, and a
   keypress must flush the owed frame before acting on the draft (same rule the
   paste-burst already follows).
4. **Skip byte-identical repaints.** Cache the last composed frame payload
   (`buffer`/`cursor`/`selectedIndex` + footer) and, when the frame is still
   visible and the payload is identical, do nothing.
5. **Reserve rows only when needed.** Emit the `'\n'.repeat(reserveRows)`
   reservation only when `lastTopOffset + layout.height` would exceed
   `process.stdout.rows`; otherwise draw in place (no scroll per repaint).
6. **Persistent prompt's erase** (`eraseChunk`, `:507-511`): same bounded-erase
   rule, so both frames obey ONE rule. Do not touch its DEC 2026 wrapper, its
   clamp, its burst coalescing or its `shutdown()` handle.

## Tests to add (extend the existing suites — do not create a new harness)

- `test/prompt-input-render.test.js` (its emulator already consumes the DEC 2026
  pair — Stage A taught it):
  - 50 intercepted writes inside one tick → ONE `2026` pair and at most one full
    frame draw;
  - a hide never emits `ESC[0J`;
  - an unchanged frame (same buffer/cursor) does not re-emit the payload;
  - `TMUX=1` → no `2026` marker; non-TTY stdout → no marker and no cursor escape;
  - the row reservation is skipped when the frame fits.
- `test/thinking-stream-append.test.js` / `turn-input-cap.test.js`: unchanged
  behavior confirmed (no new markers inside a single-line write).
- Regression: the four UI suites keep their counts (render **32**,
  thinking-append 9, turn-input 14, active-turn 1); `thinking-during-active-turn`
  must stay green (it drives the real frame under the lease).
- The flicker itself cannot be asserted in CI — say so in the spec; the marker
  and erase assertions are the proxy.

## Constraints

- No new dependencies; rendering stays in `ui/` with the `C` palette.
- Reuse `commit-frontier.js`'s helpers — never hand-roll `ESC[?2026h/l` again.
- Do not change: the frame CONTENT, the layout/height budget (P2-18, landed), the
  clamp rules, the frontier, the paste-burst path (P0-4), the `onReady`
  `shutdown()` (P1-15), or the cursor-positioning math.
- `turn-keys.js` must not exceed its lint budgets; keep the ADR-0003 lease
  contract (a write through `writeDirect` is the atomic unit) intact.

## Verification

```
node --check src/ui/turn-keys.js src/ui/prompt-input-persistent.js
node --test test/prompt-input-render.test.js test/thinking-stream-append.test.js test/turn-input-cap.test.js
npm run lint && npm test
```
Baseline (2026-10-10): 468 tests / 458 pass / 0 fail / 10 env skips; lint exit 0.

## Docs sync (Rule 2)

- CHANGELOG `[Unreleased]` → Fixed: the active-turn frame is a single synchronized
  transition with a frame-bounded erase, coalesced per tick; no repaint when the
  frame is unchanged.
- `docs/architecture.md` ui/ row (the frame-transition contract);
  `docs/deep-dive.md` § 6 + § 19 + § 21.1 P1-16 (mark the remaining items done);
  `features/terminal-ui.md` Change History.