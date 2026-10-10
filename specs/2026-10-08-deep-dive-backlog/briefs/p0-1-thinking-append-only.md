# BRIEF P0-1 — Thinking stream: replace cumulative redraw with append-only rendering

> Read first: `specs/2026-10-08-deep-dive-backlog/_shared-constraints.md` and `docs/deep-dive.md` § 6–7 (root cause, failure modes, accepted fix design § 7.4, test-method gap § 7.3).

> **Status note (2026-10-10):** P0-4 landed (`c839957`, `specs/2026-10-09-paste-burst-redraw/`) and introduced the viewport clamp this brief needs — `viewportCursorUp()` / `writeCursorUp(rows)` at `src/ui/prompt-input-persistent.js:139-155`, currently module-local. Extract them to a shared module instead of duplicating (step 6 below).

## Goal

`appendThinkingStream()` (`src/ui/thinking.js:79-127`) redraws the ENTIRE accumulated thinking block on every reasoning delta using an **unclamped** cursor-up (`\x1B[${oldTotal}A`, `:103`). That is visually correct only while the block fits above the cursor in the terminal viewport. When the block exceeds `process.stdout.rows`, when stdout is not a TTY (pipe/redirect), or under the stdout lease of `listenTurnKeys`, old frames survive and the thought appears multiple times ("agent hallucinating"). `endThinkingStream()` has the same unclamped cursor-up (`:150`). Replace the redraw with append-only emission so every reasoning fragment is rendered **exactly once** on any terminal.

## Current behavior (facts, verified 2026-10-10)

- State: `_thinkingBuffer`, `_thinkingLinesPrinted`, `_thinkingHeaderLineCount` (`thinking.js:49-54`).
- `startThinkingStream()` prints header `✻ Thinking…` (expanded) or ghost `··· thinking` (collapsed) (`:56-77`).
- `appendThinkingStream(delta)`: wraps ALL of `_thinkingBuffer` into `newLines` (`:91-95`), computes `oldTotal = header + printed` (`:97`), emits `\x1B[${oldTotal}A` (`:103`), re-renders the header and **every** line with a `\r\x1B[K` prefix (`:106-114`). No `isTTY` guard, no `rows` check anywhere in the file (verified by grep).
- `endThinkingStream()` (`:129-162`): collapsed path is already append-safe (single `\x1B[1A`, `:142`); the expanded path rewrites the header with `\x1B[${totalLines}A` (`:150`) — unclamped.
- Expanded mode is the DEFAULT: `config.expandThinking = true` (`src/config.js`).
- Consumer: `src/agent/agent.js` per-delta append + end-of-stream (search `appendThinkingStream`).
- Existing harness note: `test/thinking-during-active-turn.test.js` covers the ACTIVE-TURN path; the new suite below is the duplication-method regression.

## Required design (do not re-derive; implement this)

1. Track `_flushedLineCount` = number of wrapped lines already emitted WITH a trailing `\n`, plus an `_openTailWritten` flag for the single trailing line emitted WITHOUT `\n` (the "open" line).
2. Add a per-stream `_appendOnly` latch, set the moment the block first cannot fit.
3. On each delta: recompute `newLines` from the full buffer ONCE (same wrap math as today).
   - **In-place path** (keep it) only while ALL hold: `process.stdout.isTTY`, `! _appendOnly`, and
     `_thinkingHeaderLineCount + newLines.length <= Math.max((process.stdout.rows || 50) - 2, 1)`.
     Use the SHARED clamp for its cursor-up (`writeCursorUp(oldTotal)`), i.e. the in-place path can no
     longer emit an unbounded `\x1B[nA` even if the estimate is off by a row.
   - **Append-only path** (latch `_appendOnly = true` and never leave it for this stream): if `_openTailWritten`,
     first rewrite the open line in place with `\r\x1B[K` (no cursor-up needed besides this row); then emit
     lines `[_flushedLineCount, newLines.length - 1)` each as `'  ' + C.muted(line) + '\n'`; write the final
     line as the new open tail WITHOUT `\n`; update `_flushedLineCount`/`_openTailWritten`. Never emit a
     cursor-up larger than 1 in this mode.
4. `endThinkingStream()`: when `_appendOnly` (or `!process.stdout.isTTY`), do NOT rewrite the header — the
   closed lines may have scrolled. Close the open tail with `\n` and, when a header was printed, append a
   fresh one-line footer (`  ✻ Thought for Ns`). Otherwise keep today's clamped header rewrite.
5. Collapsed mode untouched (already append-only, `:84-85`, `:137-143`).
6. Extract the shared clamp: new `src/ui/terminal-cursor.js` exporting `viewportCursorUp()` and
   `writeCursorUp(rows)` moved VERBATIM from `prompt-input-persistent.js:139-155`;
   `prompt-input-persistent.js` imports them (zero behavior change) and `thinking.js` uses them.
7. Public API unchanged: `startThinkingStream`, `appendThinkingStream`, `endThinkingStream`, `printThinking`.

## Tests to add (new file `test/thinking-stream-append.test.js`)

- Capture-only fake stdout (patch `process.stdout.write`; `test/prompt-input-render.test.js` shows the
  pattern — no emulator needed here), `process.stdout.columns` pinned, `rows` pinned, `isTTY` controlled.
- Case A (`isTTY=false`): 30 deltas of a 200+ line stream containing `APPEND_ONLY_MARKER_XYZ` →
  the marker appears EXACTLY once; **no** `\x1B[nA` sequence with `n > 1` in the raw writes.
- Case B (TTY, `rows = 24`): same feed → marker count 1; no `\x1B[nA` with `n > 23` anywhere.
- Case C: `endThinkingStream()` after a block that exceeded the viewport emits no `\x1B[nA` beyond the clamp
  and closes the tail line.
- Case D (no regression of the good path): a SHORT stream that fits uses the in-place rewrite (assert the
  text appears once on screen AND that cursor-up sequences were used — i.e. it did not silently degrade).
- Case E (collapsed): `config.expandThinking=false` → output is exactly the ghost start line + the
  one-line `··· thought Ns` close, no block redraw.
- Case F (regression): `test/prompt-input-render.test.js` stays 20/20 after the helper extraction.

## Constraints

- Do not touch `response.js`, `agent.js`, `turn-keys.js` in this brief (the response streamer is its own
  § 7.4 item; if `turn-keys.js` shows the same uncapped pattern, REPORT it, do not fix).
- `EMILE_DEBUG_THINKING` diagnostics must keep working (`debugWrite` calls on every emission).
- Do not change the wrap math, the `innerW = max(cols - 4, 40)` budget, or the muted styling.
- No new dependencies.

## Verification

`node --check src/ui/thinking.js src/ui/terminal-cursor.js src/ui/prompt-input-persistent.js && node --test test/thinking-stream-append.test.js test/prompt-input-render.test.js && npm run lint && npm test`

Baseline (2026-10-10): 387 tests / 377 pass / 0 fail / 10 env skips; lint 0 errors. `npm test` must exit 0.
Pre-existing working-tree changes from other sessions must not be staged.

## Docs sync (Rule 2)

- CHANGELOG `[Unreleased]` → Fixed: thinking stream duplication (append-only beyond viewport / non-TTY).
- `docs/deep-dive.md` § 7.4: mark the fix applied (change the "não aplicada" wording); § 20 pattern row
  "Cursor-up frame redraw" — drop the defect note once both thinking.js and prompt-input-persistent.js are safe.
- `features/terminal-ui.md`: Change History row.
- `docs/architecture.md` § 2 ui/ row golden rule ("complete bounded frames") — no change needed if still true.