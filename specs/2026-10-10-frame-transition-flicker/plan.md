# Plan: Atomic active-turn frame transition (no flicker while streaming)

| Field | Value |
|-------|-------|
| **Spec** | `2026-10-10-frame-transition-flicker` |
| **Status** | `implemented` |

---

## 1. Technical Approach

`src/ui/turn-keys.js` is restructured around a single **transition** concept,
without touching the frame's content, the layout budget, the clamp rules or the
caret math.

1. **`createLiveInput` composes instead of writing.** It stops calling
   `writeDirect` and returns strings to the caller:
   - `takeEraseChunk()` — the bounded erase (RF-S02) plus `ESC8`;
   - `buildFrame(payload, { inPlace })` → `{ chunk, signature, height, topOffset }`
     — pure: it composes the reservation (or not, RF-S05), `ESC7`, the rows and
     the caret moves, and returns a content-only `signature`;
   - `markDrawn(frame)` — records `visible`/`lastTopOffset`/`lastHeight`/`lastSignature`
     and returns the chunk to emit;
   - `isOnScreen(frame)` — `visible && frame.signature === lastSignature`
     (RF-S04).
   The erase deliberately keeps `lastTopOffset`/`lastHeight` after marking the
   frame hidden: the flush needs that geometry to decide `inPlace`.
2. **The lease owns the transition.** `listenTurnKeys` gains four pieces of
   state — `updateOpen`, `updateWrapped`, `frameOwed`, and the per-transition
   counters `movedRows`/`transitionWidth` — plus `openUpdate()`/`closeUpdate()`
   built on the exported `SYNCHRONIZED_BEGIN`/`SYNCHRONIZED_END` **constants and
   predicate** of `commit-frontier.js` (never a hand-rolled literal, and one
   decision for both markers, exactly as the reference does).
   `interceptedWrite` opens the update and erases once (`RF-S01`, `RF-S03`),
   writes the agent's bytes through the original writer, accumulates how many
   rows those bytes moved the cursor, and schedules `flushTransition()` on a
   `setImmediate`. The flush draws once, closes the update, and emits one write.
3. **Bounded erase (RF-S02).** Climb to the frame's top, then walk its own rows
   clearing each with `\r\x1B[K` and stepping with `ESC[1B` — cursor-down never
   scrolls (only LF/IND/NEL do), so the erase can never touch the agent output
   above the frame nor anything below a short frame. The old `\r\x1B[0J` is gone
   from `turn-keys.js` and from `prompt-input-persistent.js` (RF-S06, F6 of the
   brief): the latter walks the same way and returns to the block's top row,
   because its frame is drawn from there.
4. **Coalescing + identical skip (RF-S03, RF-S04).** `paintFrame()` is the one
   "draw the frame now" path used by keypresses, the `redraw()` handle and the
   transition's settle step. It skips entirely when the frame is on screen and
   identical.
5. **Reservation only when proven in place (RF-S05).** `inPlace` is true when the
   transition's chunks moved the cursor down by zero rows (`\n` and `ESC[nB`
   counted; a chunk whose text cannot be inspected — a Buffer of unknown
   encoding — counts as moving) and the frame did not grow. Then the frame lands
   on rows it just vacated, which were on screen, so the draw cannot scroll and
   the `ESC7` slot cannot drift.

## 2. Architectural Compliance

- **ADR-0003:** the lease contract is preserved and *strengthened*: the agent's
  bytes still go through the original writer, the frame still lives below them,
  the real caret still ends inside the draft, and every frame byte now leaves
  through the same leased writer inside one atomic region. Keypress handling
  settles an owed redraw before it acts on the draft, which is the rule the paste
  burst already follows.
- **ADR-0001:** no new dependency, no build step, plain ES modules. The
  synchronized-output helper is imported, not reimplemented.
- **Architecture document:** the `ui/` row gains the frame-transition contract
  (one update per transition, bounded erase, no redundant repaint).
- **Design system:** nothing visual changes — no new glyph, color, spacing or
  block shape. The frame's content is byte-identical to before; only *when* and
  *how* it is written changes.

## 3. Security and Threat Model

| Element | Handling |
|----------|------------|
| Command execution and whitelist | Not applicable — no execution path is touched. |
| File writes and `resolveSafePath` | Not applicable — nothing is written to disk. |
| LLM inputs (prompt injection / tool args) | Not applicable: the frame is built from the bounded/sanitized draft and fixed literals; the agent's chunk is only *measured* (row count), never parsed into the frame. |
| Secrets (API keys, sessions, exports) | Not applicable — no new output carries state; the transition writes the same bytes plus fixed markers. |
| Controls and negative tests | No `ESC[0J` in any frame hide; no marker under `$TMUX` or on a non-TTY stdout; no cursor escape on a non-TTY stdout; every opened update closed (settle paths: flush, `paintFrame`, `cleanup`, plus a `finally` around the agent's write); every climb clamped. |

## 4. Impacted Modules

| Module | Path | Change |
|--------|---------|---------|
| Active-turn frame | `src/ui/turn-keys.js` | Transition machinery (one synchronized update per transition), bounded erase, coalescing, identical-skip, conditional reservation. |
| Persistent prompt | `src/ui/prompt-input-persistent.js` | `eraseChunk()` becomes a bounded walk (F6) and records the block's height. |
| Render harness | `test/prompt-input-render.test.js` | Emulator learns `ESC[1B`, `ESC7`/`ESC8` and the private-mode pair; new flicker-proxy cases. |
| Active-turn harness | `test/turn-keys-visibility.test.js`, `test/thinking-during-active-turn.test.js` | Emulators learn the private-mode pair; the visibility suite's timing assumption moves to the new contract (its invariants are strengthened). |

## 5. Impacted Flags / Slash Commands / Tools

| Type | Name | Change |
|------|------|--------|
| CLI flag | — | None |
| Slash command | — | None |
| Tool | — | None |
| MCP | — | None |

## 6. Files to Create/Modify

| Action | Path (expected) | Notes |
|------|--------------------|-------------|
| Create | `specs/2026-10-10-frame-transition-flicker/{spec,plan,tasks}.md` | SDD record. |
| Modify | `src/ui/turn-keys.js` | The transition. |
| Modify | `src/ui/prompt-input-persistent.js` | Bounded erase in the idle frame. |
| Modify | `test/prompt-input-render.test.js` | Harness + 6 proxy cases. |
| Modify | `test/turn-keys-visibility.test.js`, `test/thinking-during-active-turn.test.js` | Harness faithfulness + the new timing contract. |
| Modify | `CHANGELOG.md`, `docs/architecture.md`, `docs/deep-dive.md` (§ 6, § 19, § 21.1), `features/terminal-ui.md` | Rule 2 sync. |

## 7. Technical Decisions (summary)

1. **One decision for both markers, per transition:** `openUpdate()` reads
   `shouldEmitSynchronizedOutput()` once and `closeUpdate()` reuses it, so a
   tmux/TTY change mid-transition cannot emit half a pair.
2. **The agent's bytes are never buffered.** Only the frame redraw is deferred;
   the chunk goes to the terminal immediately through the original writer, so
   backpressure, write ordering and the return value of `process.stdout.write`
   are untouched. The price is that the markers are emitted in separate writes —
   which is exactly what DEC 2026 is for (the terminal holds presentation until
   `END`), and keeps the transition observable synchronously.
3. **An empty write performs no transition** (nothing can move), and an
   uninspectable chunk (Buffer of unknown text) is treated as *moving* the
   cursor, so it never claims the in-place proof.
4. **The bounded erase walks the frame's own rows** rather than `ESC[0J`. Rows
   below a shorter frame are still cleared (they were part of the frame that was
   last drawn, so they are inside the "own rows" budget), just never the whole
   screen.
5. **`prompt-input-render`'s `renderCount()` (`╭` occurrences) stays the frame-draw
   counter** for the active-turn cases too: `turn-keys` draws the same full
   layout, so one draw = one `╭`.

## 8. Verification Strategy and Gates

| AC | Verification |
|----|--------------|
| AC-01 | `test/prompt-input-render.test.js` — 50 writes in one turn: exactly one `2026` pair, one `╭`, every agent line present exactly once. |
| AC-02 | Same suite — no `ESC[0J` in any transition; the erase's `ESC[1B`/`ESC[K` step count equals the frame's row count; screen assertions (existing residue-free cases) stay green. |
| AC-03 | Same suite — a repeated `redraw()` on an unchanged draft emits zero bytes. |
| AC-04 | Same suite — `TMUX=1` and `isTTY=false` cases. |
| AC-05 | Same suite — spinner-like chunk (no down-move) ⇒ no reservation; one-line chunk ⇒ reservation; plus the pure `buildPromptLayout`/`promptFrameBudget` cases already in the suite. |
| AC-06 | `node --check` on both touched modules; the five suites; `npm test`; `npm run lint`. |
| AC-07 | Inspection of the four documents. |

## 9. Git Workflow

| Item | Answer |
|------|--------|
| **Working branch** | `development` — no switch, no branch, no worktree (Rule 8). |
| **Commit plan** | (1) spec + `turn-keys.js` transition + harness/tests; (2) the persistent-prompt erase + its assertions; (3) docs. Explicit paths only, never `git add .`. |

## 10. Failures, Partial State and Rollback

| Topic | Strategy |
|------|------------|
| Error handling and user-facing messages | If the agent's write throws, the `finally` still settles the transition (closing the synchronized update), so the terminal is never left in synchronized mode; a turn that ends mid-write settles without painting. |
| Interruption (Ctrl+C / Esc) and readline state | Untouched: the keypress paths are unchanged except that they settle an owed redraw first (which the paste-burst rule already required). |
| Partial state (session, undo stack, file cache) | None — rendering only. |
| Rollback / undo | Revert the commits; no persisted format changed. |

## 11. Technical Risks and Trade-offs

| Risk | Likelihood | Mitigation |
|-------|---------------|-------------|
| **The brief's reservation formula risks `ESC8` drift** (worked example: `rows = 24`, previous frame on rows 19–23 so `S = 18`; a one-line chunk puts `A' = 19` and the frame draws to row 24 → the terminal scrolls during the draw, while the formula's `lastTopOffset + height = 2 + 5 = 7 ≤ 24` would have skipped the pre-scroll). | Certain if implemented verbatim | Implemented the provable variant instead (`inPlace`: zero down-moves + no growth). Skipping is then a proof, not an estimate; the pre-existing reservation is kept wherever the proof does not hold, so nothing that used to be safe changed. Documented as a deviation with the example. |
| Coalescing a redraw to the next immediate could, in principle, leave the frame erased if the process dies in between. | Low | The pending handle is `unref`'d, `cleanup()` settles synchronously (and a very short live-erase window is far better than 50 full repaints), and the flush runs before any keypress acts. |
| The bounded erase walks rows with `ESC[1B`; a row that is off screen (shrink race) cannot be cleared and the return climb is then short. | Low | Geometry is relative to the caret, so the next transition recomputes correctly; the clamp keeps every climb inside the viewport. Recorded as residual risk (the `ESC[0J` behaviour could not be kept — the brief forbids it). |
| Two extra emulators now parse the private-mode pair. | Low | The change is additive parsing of a sequence the module legitimately emits; no assertion was removed. |