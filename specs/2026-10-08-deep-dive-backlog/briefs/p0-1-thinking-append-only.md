# BRIEF P0-1 — Thinking stream: replace cumulative redraw with append-only rendering

> Read first: `specs/2026-10-08-deep-dive-backlog/_shared-constraints.md` and `docs/deep-dive.md` § 6–7 (root cause, failure modes, accepted fix design).

## Goal

`appendThinkingStream()` (`src/ui/thinking.js:79-127`) redraws the ENTIRE accumulated thinking block on every reasoning delta using cursor-up (`\x1B[${oldTotal}A`). That is visually correct only while the block fits above the cursor in the terminal viewport. When the block exceeds `process.stdout.rows`, when stdout is not a TTY (pipe/redirect), or under the stdout lease of `listenTurnKeys`, old frames survive and the thought appears multiple times ("agent hallucinating"). Replace the redraw with append-only emission so every reasoning fragment is rendered **exactly once** on any terminal.

## Current behavior (facts)

- State: `_thinkingBuffer`, `_thinkingLinesPrinted`, `_thinkingHeaderLineCount` (`thinking.js:49-54`).
- `startThinkingStream()` prints header `✻ Thinking…` (expanded) or ghost `··· thinking` (collapsed) (`:56-77`).
- `appendThinkingStream(delta)`: wraps ALL of `_thinkingBuffer` into `newLines`, moves cursor up `oldTotal` rows, rewrites every line with `\r\x1B[K` prefix (`:91-123`). No `isTTY` guard, no rows check anywhere in the file.
- `endThinkingStream()` uses cursor-up to rewrite the header with final duration (`:129-162`).
- Expanded mode is the DEFAULT: `config.expandThinking = true` (`src/config.js:109`).
- Consumer: `src/agent/agent.js:486-512` (per-delta), `:586-592` (end-of-stream).

## Required design (do not re-derive; implement this)

1. Track `_flushedLineCount` = number of wrapped lines already emitted to the terminal, plus whether the last emitted line was "closed" (terminated by `\n`).
2. On each delta: recompute wrapped lines of the full buffer ONCE into `newLines`.
   - If the whole block fits in the current viewport (`_thinkingHeaderLineCount + newLines.length <= (process.stdout.rows || 50) - 2`) AND stdout is a TTY, you MAY keep the existing in-place rewrite path (it is correct there).
   - Otherwise (viewport exceeded, or `!process.stdout.isTTY`), switch to append-only: emit ONLY the lines after `_flushedLineCount`, and for the trailing partial line emit `\r\x1B[K` + text + no newline (single-line rewrite is always safe, even after scroll).
3. Guard placement: the TTY/rows check happens at the TOP of `appendThinkingStream` and selects the path; `endThinkingStream()` must skip the cursor-up header rewrite when the block exceeded the viewport (append a final one-line footer instead of rewriting the header).
4. Collapsed mode is untouched (already append-only, `thinking.js:84-85`).
5. Public API unchanged: `startThinkingStream`, `appendThinkingStream`, `endThinkingStream`, `printThinking` signatures.

## Tests to add (new file `test/thinking-stream-append.test.js`)

- Fake stdout via `node:stream` PassThrough patched onto `process.stdout` (pattern: `test/prompt-input-render.test.js` uses an emulator; you only need capture, not emulation).
- Case A (`isTTY=false`): feed 30 deltas of a 200+ line reasoning stream containing the unique marker `APPEND_ONLY_MARKER_XYZ`; assert the marker appears exactly once in captured output.
- Case B (TTY, `rows = 24`): same feed; assert marker count is 1 and that no `\x1B[` n `A` sequence with `n > rows` is emitted after the block exceeded the viewport.
- Case C: endThinkingStream with an over-viewport block produces no cursor-up larger than rows.

## Constraints

- Do not touch `response.js`, `agent.js`, `turn-keys.js` in this brief.
- `EMILE_DEBUG_THINKING` diagnostics must keep working (`debugWrite` calls).
- Do not add dependencies.

## Verification

`node --check src/ui/thinking.js && node --test test/thinking-stream-append.test.js && npm run lint && npm test`

## Docs sync (Rule 2)

- CHANGELOG `[Unreleased]` → Fixed: thinking stream duplication (append-only beyond viewport / non-TTY).
- `docs/deep-dive.md` § 7.4: mark fix as applied (change "não aplicada" wording), and update the pattern row "Cursor-up frame redraw" in § 20.
- `docs/architecture.md` § 2 ui/ row golden rule mentions "complete bounded frames" — no change needed if wording still true.
