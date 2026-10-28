# BRIEF P2-19 — Route the remaining cursor-up emitters through the shared clamp

> Read first: `specs/2026-10-08-deep-dive-backlog/_shared-constraints.md` and
> `docs/deep-dive.md` § 7 (duplication family), § 20, § 22.2. Depends on nothing;
> P0-4 and P0-1 already extracted the shared clamp
> (`src/ui/terminal-cursor.js`: `viewportCursorUp`, `clampedCursorUp`,
> `writeCursorUp`).

## Goal

Two renderers are now clamped (`thinking.js`, `prompt-input-persistent.js`) but
four sites still emit **unbounded** `ESC[nA`, i.e. the same family that produced
the thinking and large-paste duplication:
`src/ui/turn-keys.js:78, 91` (the ACTIVE-TURN prompt frame — `hideFrame` /
`repaint` under the ADR-0003 stdout lease), `src/ui/model-picker.js:145` (the
`/model` picker is tall by nature) and `src/ui/prompt-input.js:192, 234, 242, 365`
(legacy prompt renderer). A block taller than the viewport, or any non-TTY
stdout, lets those climbs clamp at the viewport top and leaves a stale frame.
Route every one of them through `src/ui/terminal-cursor.js`.

## Current behavior (facts, verified 2026-10-10 by grep)

- `turn-keys.js:78` `\x1B[${rowsUp}A`, `:91` `\x1B[${lastTopOffset}A` and the
  reserve block near `:73`; the only guard in the file is
  `enabled = process.stdout.isTTY !== false` (`:45`) — it stops DRAWING on
  non-TTY but does nothing about climb height.
- `model-picker.js:145` `process.stdout.write(\`\x1B[${lastRenderedHeight}A\`)`.
- `prompt-input.js:192, 234, 242, 365` — four climbs (legacy renderer).
- `thinking.js:204, 224, 265` are already inside clamped paths (do not touch).
- `response.js` is a separate § 7.4 item — out of scope here.

## Required design (do not re-derive; implement this)

1. For each site, replace the raw escape with the shared helper:
   - climbs whose erase is its OWN write step → `writeCursorUp(rows)` (it already
     no-ops on non-TTY and clamps);
   - climbs embedded in a single atomic frame buffer (the lease-safe pattern
     used by `thinking.js`) → `clampedCursorUp(rows)` so the clamp and the frame
     stay in ONE `write`.
2. `turn-keys.js` is the load-bearing one: its frame is repainted on every
   intercepted stdout write, so the climb must stay inside the same write as the
   frame (use `clampedCursorUp`, matching `thinking.js`) — and when the frame
   height itself exceeds `stdout.rows - 1`, skip the climb entirely and let the
   frame scroll (never leave the screen half-erased).
3. No layout/word-wrap/width changes; no behavior change for blocks that fit.

## Tests to add (extend `test/` — new file `test/cursor-clamp-sites.test.js`)

- Static-assertion test: `src/ui/{turn-keys,model-picker,prompt-input}.js`
  contain NO raw `\x1B[${…}A` emission outside the shared module (regex over the
  source, with an explicit allow-list comment for any justified exception).
- `turn-keys.js` behavioral case: install `listenTurnKeys` with a fake stdout
  (`rows = 10`), push a frame taller than the viewport, and assert no emitted
  `\x1B[nA` has `n > 9`; with `isTTY = false`, assert none at all.
- `model-picker.js` case: render a 40-entry list with `rows = 12` → no climb
  above 11; the final screen state (capture-count method, § 7.3) shows the
  selected row exactly once.
- Regression: `test/prompt-input-render.test.js` (20) and
  `test/thinking-stream-append.test.js` (9) stay green.

## Constraints

- Do not re-open the P0-4 burst logic or the P0-1 append-only latch.
- `EMILE_DEBUG_*` diagnostics and the ADR-0003 lease semantics unchanged.
- No new dependencies.

## Verification

`node --check src/ui/turn-keys.js src/ui/model-picker.js src/ui/prompt-input.js && node --test test/cursor-clamp-sites.test.js && npm run lint && npm test`
Baseline (2026-10-10): 396 tests / 386 pass / 0 fail / 10 env skips; lint 0 errors.

## Docs sync (Rule 2)

- CHANGELOG `[Unreleased]` → Fixed: every renderer's cursor-up is viewport-bounded
  (no stale frames from the active-turn prompt frame, the /model picker or the
  legacy prompt).
- `docs/deep-dive.md` § 22.5-family note + § 20 row + § 21.1; `features/terminal-ui.md`
  Change History; `docs/architecture.md` ui/ row if it enumerates renderers.