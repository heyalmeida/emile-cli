# BRIEF P1-14 — UI foundation from grok-build: one commit frontier, one bounded frame

> Read first: `specs/2026-10-08-deep-dive-backlog/_shared-constraints.md`,
> `docs/deep-dive.md` § 7, § 19, § 22 (the reference analysis), and the
> reference implementation at `C:\Users\mc33p\Documents\GitHub\grok-build`
> (Rust; paths below are relative to `crates/`).

> **How to read "use grok-build as the base of code" (explicit assumption):**
> grok-build is Rust and emile is ES-module JavaScript with ADR-0001 forbidding
> build steps/TypeScript — literal code reuse is impossible. This brief ports
> the reference's **architecture and invariants** into `src/ui/`, citing the
> reference `file:line` for each mechanism so the port is verifiable. If the
> user wants literal code reuse (a Rust TUI inside emile, or a sidecar pager),
> that is an ADR-level decision and a DIFFERENT brief — flag it in your report,
> do not improvise it.

## Goal

Make emile's UI robust by construction, the way the reference is: output is
**committed once** into the terminal's own scrollback and never repainted, and
the live prompt owns an **inline viewport bounded by `stdout.rows`**. Today
emile repaints mutable blocks with erase-and-redraw, which is why the same bug
family (§ 7: thinking, § 22.2: large paste) kept reappearing; P0-1/P0-4 clamped
the damage, this removes the class.

Three stages, each independently shippable and gated. Stage A is the foundation
and the reason this item exists; B and C are parity work.

## Reference mechanisms (verified 2026-10-09, § 22)

| Mechanism | Reference | Why it matters here |
|---|---|---|
| One-way **commit frontier** (print-once) | `xai-grok-pager-minimal/src/commit.rs:145-168` (`is_committable`, `commit_leading_run`; a failed write leaves the entry uncommitted so the next frame retries) | finalized agent blocks are emitted exactly once; duplicates become structurally impossible |
| Emission via scroll-insert, never erase | `xai-ratatui-inline/src/terminal.rs:661-687` (`insert_before_rows`), slack-row math `:802-858` (two slack rows so a streaming wrap cannot autowrap off the last line) | the block moves UP into native scrollback instead of being re-painted |
| Frame budget vs terminal rows | `xai-grok-pager/src/app/mod.rs:692-733` (`set_viewport_height` scrolls overflow out before growing), `views/agent.rs:423-429` (`rows_available_for_prompt`) | the prompt frame can never exceed the viewport (this is P2-18's requirement, done right) |
| Cell-diff repaint (full-screen mode) | `xai-ratatui-inline/src/terminal.rs:497-541` (`try_draw`), `:148-181` (double buffer) | only changed cells are written; no cursor-up math at all |
| Wrapper for multi-row writes | `xai-grok-pager-render/src/render/draw.rs:500-516` (`should_emit_synchronized_output`, used at `:515`), literals `BEGIN`/`END` at `:750-751` — and note the reference **omits** the wrapper when tmux is the immediate terminal (`:38`: tmux repaints the pane and already synchronizes) | kills tearing during fast repaints; port the tmux exception too |
| Paste as data, big pastes collapse | `xai-grok-pager/src/event_loop.rs:3610-3710` (burst coalescing), `views/prompt_widget/mod.rs:2286-2344` (`[Pasted: N lines]` chip) | P0-4 took the first half; the chip is stage B |
| Thinking display modes | `scrollback/blocks/thinking.rs:284-455` (Collapsed / Truncated / Expanded), `finished_display_mode = Collapsed` (`:532-560`) | fold-on-finish with `ctrl+e` to expand, instead of emile's all-or-nothing `expandThinking` |

## Stage A — output commit frontier + bounded prompt frame (the real item)

1. New `src/ui/commit-frontier.js`: a small model that owns "blocks already
   committed" — `createFrontier()` → `{ commit(blockText), markCommitted(ids) }`
   with the print-once rule: a block is written with a trailing `\n` and NEVER
   touched again; if the write throws, the block stays uncommitted so the next
   frame retries (reference `commit.rs:145-168`).
2. Agent output that is FINAL (a closed thinking block, a finished tool box, a
   completed assistant response) goes through the frontier: written once, never
   repainted. Streaming (still-open) content stays on the existing clamped paths
   until it closes, then commits.
3. The prompt keeps owning an inline frame, but its height is computed from
   `stdout.rows` minus chrome (menu + borders + footer), and the frame is
   bottom-anchored: when it does not fit, the OLDEST rows scroll out instead of
   being erased. This is P2-18's fix (`⌃ N earlier rows` / `⌄ N later rows`
   markers) — implement it HERE, in the frontier-aware layout, not as a separate
   pass.
4. Wrap every multi-row write in synchronized output (`ESC[?2026h`/`l`), reference `render/draw.rs:500-516` — including the reference's tmux exception (`:38`): when `$TMUX` is set, skip the wrapper.
5. Acceptance for stage A: no code path in `src/ui/` emits an `ESC[nA` beyond the clamp. The sites still uncapped TODAY (re-verified 2026-10-10 — `thinking.js:204, 224, 265` are already clamped via `clampedCursorUp`, do NOT touch them):
   `turn-keys.js:146, 151, 164` (re-derived after P1-13 rewrote the file), `model-picker.js:145`, `prompt-input.js:192, 234, 242, 365` — route them through `src/ui/terminal-cursor.js`. Also P2-18's height budget lives here: `buildPromptLayout` still has NO `maxRows` parameter (only `input`, `columns`, …), so a tall draft draws an unbounded block.
6. Existing UI suites that must stay green (counts verified today): `test/prompt-input-render.test.js` (20), `test/thinking-stream-append.test.js` (9), `test/turn-input-cap.test.js` (14), `test/thinking-during-active-turn.test.js` (1). `test/prompt-input-render.test.js` already carries the ANSI emulator and pins `isTTY`/`rows` — build the new cases on top of it, and note P1-15 added `shutdown()` to the `onReady` handle in `prompt-input-persistent.js` (do not disturb it).
7. Tests for stage A: new `test/commit-frontier.test.js` (print-once: a committed block is never re-emitted; a failed write stays uncommitted and is retried once; eviction order), plus new cases in `test/prompt-input-render.test.js` (a 200-line draft with `rows = 24` → block height ≤ rows-1, elision markers with correct counts, cursor always inside the window; `rows = 8` → still ≤ 7, no crash) and the P2-19 clamp assertions for the four sites listed in item 5.

## Stage B — component parity

1. **Paste chip**: pastes ≥4 lines or >10 KB render as a single
   `[Pasted: N lines]` row; the real text is stored and substituted at submit;
   Enter/double-click expands (reference `prompt_widget/mod.rs:2286-2344`,
   `xai-ratatui-textarea/src/textarea.rs:2555-2615`). Extend the existing
   `TURN_INPUT_MAX_CHARS` (P1-13) machinery — the cap stays as a backstop.
2. **Foldable thinking**: three display modes as in the reference — collapsed
   header after finish (`··· thought 4s · ctrl+e`), truncated (last N lines)
   while long, expanded on demand (`ctrl+e`); replaces the binary
   `config.expandThinking` (keep it as the default mode selector for
   compatibility).
3. Tests: chip round-trip (submit gets the real text; the screen shows one row),
   fold cycle (`collapsed → truncated → expanded → collapsed`), and the
   `expandThinking` regression.

## Stage C — polish + the cache diagnostic

1. Status line parity: audit emile's footer segments against the reference's
   status line (`xai-grok-status-line/`), and — from deep-dive § 8.5 — show the
   **per-request** cache hit next to the cumulative one (today
   `prompt-input-persistent.js:264` divides two session accumulators, which reads
   as "cache is broken" on long sessions; a `lastRequest` hit + the cumulative
   average removes the ambiguity).
2. Diff rendering: compare emile's `diff-block.js` with the reference's diff view
   (`xai-grok-pager-diff/`); adopt only what is demonstrably better.
3. Optional, only with explicit user go-ahead: replay a real session prefix
   against the custom endpoint to measure the per-request hit at length (costs
   real tokens — do NOT run it unattended).

## Constraints

- Rendering only through `ui/` modules and the `C` palette (lint enforces).
- No new dependencies; no build step; no TypeScript.
- All existing UI suites stay green: `prompt-input-render` (20),
  `thinking-stream-append` (9), `turn-input-cap` (14), `thinking-during-active-turn`.
- Stages are separate commits; each stage's gates must pass before the next.
- Do not touch `agent.js`'s stream-consumption contract.

## Verification (per stage)

```
node --check src/ui/*.js
node --test test/prompt-input-render.test.js test/thinking-stream-append.test.js test/turn-input-cap.test.js test/commit-frontier.test.js
npm run lint && npm test
```
Baseline (2026-10-10): 410 tests / 400 pass / 0 fail / 10 env skips; lint exit 0.

## Docs sync (Rule 2)

- CHANGELOG `[Unreleased]` per stage (Added/Changed).
- `docs/architecture.md` ui/ row (commit frontier + viewport-budgeted frame).
- `docs/visual-identity.md`: the chip and the thinking fold states are new
  visual vocabulary — document them (Rule 2 table row for UI changes).
- `docs/deep-dive.md` § 19 (UI/UX) + § 22.2 (the duplication family closed on the
  code side) + § 21.1 P1-14 row.
- `features/terminal-ui.md`: Change History per stage.