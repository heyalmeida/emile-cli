# BRIEF P0-4 — Paste burst must render once: coalesce + clamp the prompt redraw

> Read first: `specs/2026-10-08-deep-dive-backlog/_shared-constraints.md` and `docs/deep-dive.md` § 22.2 (root cause, verified 2026-10-09) and § 7.2 (same failure family as thinking.js).

## Goal

Pasting a large prompt into the persistent input duplicates the pasted text many times on screen. `render()` in `src/ui/prompt-input-persistent.js` erases the previous block with an uncapped cursor-up (`\x1B[${lastTopOffset}A`, `:300-307`, offset set at `:353`), and during bracketed paste EVERY character reaches the text branch (`:548-553`) and EVERY pasted Enter reaches the newline branch (`:474-481`), each ending in `render()` (`:554`). A 2 KB paste is ~2 000 full-block redraws; once the block exceeds `process.stdout.rows` the cursor-up clamps at the viewport top, old frames scroll away un-erasable, and each new line redraws the whole block below the previous → the pasted text appears N times. Fix: (1) coalesce the paste burst into ONE render, (2) clamp every cursor-up to the viewport, (3) never cursor-up when stdout is not a TTY.

## Current behavior (facts, verified 2026-10-09)

- `isPasting` is set on `paste-start`/`paste-end` (`:437-443`) and only used to convert Enter into a literal newline (`:474-481`). No render suppression during paste.
- `erasePreviousBlock()` (`:300-307`) emits `\x1B[${lastTopOffset}A` with no bound; `render()` writes the full block then repositions (`:309-354`).
- Non-bracketed terminals (some Windows consoles) deliver the paste as a keypress burst with NO `paste-start`/`paste-end` — the same duplication occurs there.
- `test/prompt-input-render.test.js` already has the ANSI-emulator harness (13 tests) to prove the fix.

## Required design (do not re-derive; implement this)

1. **Bracketed paste: zero renders inside the burst.** While `isPasting` is true, update `input`/`cursor` state but DO NOT call `render()`; call it once on `paste-end`. (The state branches at `:437-443` and the text/newline branches are the only touch points.)
2. **Burst coalescing for non-bracketed input** (grok `event_loop.rs:3610-3710` pattern): if ≥3 printable/Enter keypress events arrive within a 2 ms window, treat them as one paste: buffer, single `render()` at the end of the burst (flush on a 10 ms quiet timer or on the next non-pasteable key). Keep it simple: a small `pasteBurst` buffer + `setTimeout` flush inside `persistentPromptInput`; no new module unless it genuinely needs one.
3. **Clamp the erase**: in `erasePreviousBlock`, `const up = Math.min(lastTopOffset, Math.max((process.stdout.rows || 24) - 1, 0))` and skip the cursor-up entirely when `!process.stdout.isTTY`. When the block itself is taller than the viewport, accept scrolling (draw the block; do not attempt to erase more than fits) — the existing line-clip guarantee (`clipLine`) already keeps width bounded; height overflow must degrade to scroll, never to duplication.
4. Public API unchanged. `buildPromptLayout`/`clipLine`/`matchPromptCommands` exports stay as they are.

## Tests to add (extend `test/prompt-input-render.test.js`)

- Case A (bracketed): emit `paste-start`, 500 chars incl. 20 Enters, `paste-end`; assert the emulator received ≤2 full-block renders (count `\x1B[0J` or top-border occurrences), the final screen shows the complete text exactly once, and `wrapped === false`.
- Case B (non-bracketed burst): emit 200 keypresses synchronously (no paste markers); assert render count is bounded (<10) and the text appears once.
- Case C (rows clamp): with `rows = 10` and a 30-line draft, assert no emitted `\x1B[nA` has `n > 9` (parse the raw writes).
- Case D (regression): all 13 existing tests keep passing.

## Constraints

- Do not touch `thinking.js` (P0-1 owns it) or `turn-keys.js` (its own cursor-up path is out of scope here — report if you see the same uncapped pattern there, do not fix).
- No new dependencies. No changes to `buildPromptLayout` semantics.

## Verification

`node --check src/ui/prompt-input-persistent.js && node --test test/prompt-input-render.test.js && npm run lint && npm test`

## Docs sync (Rule 2)

- CHANGELOG `[Unreleased]` → Fixed: large-paste duplication in the persistent prompt (burst coalescing + viewport-clamped erase).
- `docs/deep-dive.md` § 22.2: mark the fix applied; § 20 pattern row "Cursor-up frame redraw" — update the defect note.
- `features/terminal-ui.md`: Change History row.
