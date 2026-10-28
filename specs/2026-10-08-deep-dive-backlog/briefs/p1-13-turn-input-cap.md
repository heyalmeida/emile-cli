# BRIEF P1-13 — Active-turn input silently drops everything past 400 chars

> Read first: `specs/2026-10-08-deep-dive-backlog/_shared-constraints.md` and `docs/deep-dive.md` § 19 (UI/UX), § 22.3 (steering row).

## Goal

While a turn is RUNNING, keystrokes go to `listenTurnKeys` instead of the idle
prompt. That buffer is hard-capped at 400 characters and the overflow is
discarded **silently**: `if (str && !key.ctrl && !key.meta && buffer.length <
MAX_BUFFER_CHARS)` (whole key dropped once full) and `inserted =
text.slice(0, available)` (`src/ui/turn-keys.js:27, 287-292`). `sanitizeLine`
re-applies the same cap to the queued line (`:30-36`) and the queue preview
truncates to 90 chars. Pasting a brief into a running turn therefore queues a
400-char fragment with no warning — the user believes the whole prompt was
queued (reported 2026-10-10 while dispatching a P0-1 brief by paste).

## Current behavior (facts, verified 2026-10-10)

- `MAX_BUFFER_CHARS = 400` (`turn-keys.js:27`); `sanitizeLine` slices to it
  (`:36`); the insert path slices the incoming chunk to the remaining room
  (`:287-292`) and stops accepting keys entirely once full. Bracketed paste IS
  handled (`isPasting`, `:137, 180-187`) — but the Enter inside a paste
  (`:205-214`) and Shift+Enter (`:196-204`) are gated on
  `buffer.length < MAX_BUFFER_CHARS` too, so pasted NEWLINES also vanish at the
  cap: a 8 KB paste keeps the first 400 chars and loses every line after it.
- No notice, no counter, no way to see the drop.
- `cli.js` `pendingQueue.push(line)` + a preview line `queued: <first 90 chars>`
  (`cli.js:364-369` region) — the preview hides the truncation too.
- The idle prompt (`persistentPromptInput`) has NO cap (a 8.7 KB paste is
  accepted whole — verified against `.emile/history/*.json`, message len 8681).
- `turn-keys.js` also collapses whitespace runs in `sanitizeLine`
  (`replace(/[^\S\n]+/g, ' ')`) — a second silent mutation of the queued text.

## Required design (do not re-derive; implement this)

1. **Make the cap visible and generous**: raise the buffer to a documented
   `TURN_INPUT_MAX_CHARS = 16_000` (a page of text) and expose the limit in the
   draft counter when the buffer passes 80% — e.g. render
   `queued draft: 12.8k/16.0k` in the live footer.
2. **Never drop silently**: when the cap is reached, keep the draft bounded by
   dropping the OLDEST characters (ring behavior is unnecessary — just append
   and slice the head) and print ONE dim notice per turn:
   `⚠ queued draft reached 16k chars — oldest text dropped`.
3. **Stop mutating content**: `sanitizeLine` must not collapse whitespace runs
   or strip tabs inside the draft; it may only normalize CRLF and strip control
   characters. The queued message must reach `pendingQueue` byte-identical to
   the draft (minus CRLF normalization).
4. Keep the queue preview (90 chars) as-is but append a `… (+N chars)` marker
   when the queued line is longer, so the preview never implies the whole text
   was taken.

## Tests to add (extend `test/` — new file `test/turn-input-cap.test.js`)

- Paste 20 000 chars into a RUNNING turn: the queued line is exactly
  `TURN_INPUT_MAX_CHARS` long, the notice printed once, and a second paste
  appends then trims the head (assert the tail is the newest text).
- Tabs and internal double spaces survive in the queued line (no collapsing).
- The preview line carries the `(+N chars)` marker for a long draft.
- Regression: an idle-prompt 8.7 KB paste still reaches the agent whole
  (the existing skills/prompt suites plus a direct `persistentPromptInput`
  assertion).

## Constraints

- Do not touch `persistentPromptInput`'s state machine beyond the preview
  marker; do not change the burst coalescing (P0-4) or the thinking renderer
  (P0-1, `src/ui/terminal-cursor.js`).
- `turn-keys.js`'s uncapped cursor-up (`:78, :91`) is backlog item **P2-19** —
  report if it interacts, do not fix it here.
- No new dependencies. `EMILE_DEBUG_*` diagnostics unchanged.

## Verification

`node --check src/ui/turn-keys.js && node --test test/turn-input-cap.test.js && npm run lint && npm test`
Baseline (2026-10-10): 387 tests / 377 pass / 0 fail / 10 env skips; lint 0 errors.

## Docs sync (Rule 2)

- CHANGELOG `[Unreleased]` → Fixed: input typed/pasted during a running turn is
  no longer silently truncated at 400 chars (16k cap with a visible notice, no
  whitespace mutation).
- `features/terminal-ui.md`: Change History row; `docs/deep-dive.md` § 19 + § 21.1 row.