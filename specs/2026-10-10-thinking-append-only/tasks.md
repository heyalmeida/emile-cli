# Tasks: Thinking stream renders append-only with a viewport-clamped erase

| Field | Value |
|-------|-------|
| **Spec** | `2026-10-10-thinking-append-only` |

---

## Phase 0 — Preparation

- [x] T0.1 — Read relevant documentation — *Rule 1* — `.clinerules`, brief P0-1 (incl. its 2026-10-10 refresh note) + `_shared-constraints.md`, `docs/deep-dive.md` § 6.1/§ 6.2/§ 7.1–7.4/§ 20/§ 21.1/§ 22.1, `docs/code-quality-and-security.md` § 1–3, `docs/architecture.md` (`ui/` row), `docs/visual-identity.md` (thinking rows), ADR-0001/0002/0003, `features/terminal-ui.md`, `specs/2026-10-09-paste-burst-redraw/spec.md` (sibling fix), `specs/README.md`, `specs/_templates/*`; full reads of `src/ui/thinking.js`, `src/ui/prompt-input-persistent.js:96-160`, `src/ui/theme.js` (`wrapText`), `src/agent/agent.js` thinking wiring, `test/thinking-during-active-turn.test.js`
- [x] T0.2 — Spec and plan `approved` before any code (Rule 3 order spec → plan → tasks → code); flipped to `implemented` at close
- [x] T0.3 — Risk classified **Low** (pure `src/ui/` rendering; no execution/paths/secrets); negative criteria in spec § 4; gates in plan § 8
- [x] T0.4 — Branch `development` (`git branch --show-current`); no switch/branch/worktree (Rule 8)
- [x] T0.5 — Baseline recorded on the start commit: `npm test` → **387 tests / 377 pass / 0 fail / 10 skipped / exit 0**; `npm run lint` → **144 problems (0 errors, 144 warnings)**
- [x] T0.6 — Reported facts verified in code: unclamped `\x1B[${oldTotal}A` (`:103`) and `\x1B[${totalLines}A` (`:150`); **no** `isTTY`/`rows` reference anywhere in the file; expanded is the default; the clamp lives at `prompt-input-persistent.js:136-150`; `debugWrite` wraps every emission
- [x] T0.7 — Confirmed no test calls the thinking API directly: only `test/thinking-during-active-turn.test.js` exercises it (through `runAgent` with the `listenTurnKeys` lease) — it must keep passing **unedited**

## Phase 1 — Implementation

- [x] T1.1 — `src/ui/terminal-cursor.js` created: `viewportCursorUp()`, `writeCursorUp(rows)` moved verbatim from `prompt-input-persistent.js` (comments included), documented as the single clamp source; plus a pure `clampedCursorUp(rows)` added during implementation (see T1.4 rationale) *(verifies RF-S01)*
- [x] T1.2 — `prompt-input-persistent.js`: local copies deleted, imports from the new module; nothing else touched — **pure move, proven by 20/20 unchanged render tests** *(verifies RF-S01, AC-06)*
- [x] T1.3 — `thinking.js`: added `_flushedLineCount`, `_openTailWritten`, `_openTailText`, `_appendOnly` with a single `resetThinkingLineState()` called from both `startThinkingStream` and `endThinkingStream` *(verifies RF-S12, AC-08)*
- [x] T1.4 — `appendThinkingStream`: `newLines` recomputed once with unchanged wrap math; in-place path gated on `isTTY && !_appendOnly && fits` (`fits = header + lines <= max((rows \|\| 50) - 2, 1)`), its two cursor-ups clamped *(verifies RF-S02, RF-S03, AC-04)*
- [x] T1.5 — `appendThinkingLines()` (new): latches `_appendOnly`, rewrites the open tail **only when its text changed**, emits just the unprinted suffix (closed lines with `\n`, newest as the open tail without `\n`), keeps the flush cursor monotone (a shrink clamps the tail index instead of rewinding), emits no cursor-up at all *(verifies RF-S04, RF-S05, RF-S06)*
- [x] T1.6 — `endThinkingStream`: append-only/non-TTY closes the tail and appends a fresh `✻ Thought for Ns` footer with **no** climb; the fitting path keeps the header rewrite with a clamped climb; collapsed untouched *(verifies RF-S07, RF-S08, AC-03, AC-05)*
- [x] T1.7 — Preserved: wrap math + `innerW = max(cols - 4, 40)`, muted/ghost styling, `debugWrite` tag on every emission (`thinking.append`, `thinking.appendOnly`, `thinking.end.expanded`, `thinking.end.appendOnly`, plus the existing start/collapsed tags), public API and the `ui/index.js` barrel untouched *(verifies RF-S09, RF-S10, RF-S11)*
- [x] T1.8 — **Design deviation forced by a real constraint (documented)**: the brief prescribed calling `writeCursorUp(oldTotal)` in the thinking in-place path. Routing it as a separate `write` broke `test/thinking-during-active-turn.test.js` ("the last cumulative delta must remain visible"): under the ADR-0003 stdout lease every write triggers hide→write→repaint of the prompt frame, so a cursor-up sent alone is repainted/erased before the frame it belongs to lands. The clamp is therefore **computed** through the shared `clampedCursorUp()` and **embedded in the frame's single `write`** — same clamp, same single source of truth, atomicity preserved (deep-dive § 6.2 requires the frame to be one write). `writeCursorUp` (the writing form) remains the API the persistent prompt uses

## Phase 2 — Testing, Security and Verification

- [x] T2.1 — New `test/thinking-stream-append.test.js`: capture-only fake stdout (patches `process.stdout.write` — no emulator), `columns`/`rows`/`isTTY` pinned per case and restored via `t.after`, ANSI stripped for content assertions while escape counting runs on the raw writes
- [x] T2.2 — Case A (`isTTY=false`, 210 lines through 30 deltas, marker `APPEND_ONLY_MARKER_XYZ`): marker **exactly 1**, **zero** `ESC[nA` emitted at all, sampled lines each once *(verifies AC-01)*
- [x] T2.3 — Case B (TTY, `rows=24`, same feed): marker **exactly 1**, max climb **9** (never above `rows-1` = 23), **no** cursor-up after the latch, and the end call adds none *(verifies AC-02)*
- [x] T2.4 — Case C: over-viewport block + `endThinkingStream()` → the end write starts by closing the tail, carries the footer and performs **no** cursor-up *(verifies AC-03)*
- [x] T2.5 — Case D: short fitting stream → text once **and** cursor-up sequences present (in-place path used, not degraded) *(verifies AC-04)*
- [x] T2.6 — Case E: `config.expandThinking = false` → exactly one `··· thinking` start line, exactly one `··· thought Ns` close, no reasoning body, no climb above one row *(verifies AC-05)*
- [x] T2.7 — Case G: a second stream after a latched one redraws in place again (no inherited latch) *(verifies AC-08, RF-S12)*
- [x] T2.8 — Two extra boundary cases: a growing line rewrites only its own row (and never climbs), and empty/null/undefined deltas emit nothing
- [x] T2.9 — `node --check src/ui/thinking.js src/ui/terminal-cursor.js src/ui/prompt-input-persistent.js` → all clean
- [x] T2.10 — `node --test test/thinking-stream-append.test.js test/prompt-input-render.test.js test/thinking-during-active-turn.test.js` → **30 tests / 30 pass / 0 fail** (9 new + 20 render + 1 lease-aware active-turn)
- [x] T2.11 — `npm run lint` → **144 problems (0 errors, 144 warnings)**, identical to baseline; `npm test` → **396 tests / 386 pass / 0 fail / 0 cancelled / 10 skipped / exit 0** (= baseline 387 + 9 new)
- [x] T2.12 — `npm audit` → not applicable: no dependency added; `package.json`/lockfile untouched
- [x] T2.13 — **Mutation verification** (each reverted alone, suite re-run, sources restored in a `finally`):
  - append-only latch removed (always repaint) → **fail (exit 1)**: non-TTY case, TTY `rows=24` case, topology case, end case and growing-line case — reasons: *"the marker must be emitted exactly once"*, *"line 30 must be rendered exactly once"*, *"the append-only close performs no cursor-up"*
  - suffix discipline broken (`next = 0`, re-emitting closed lines) → **fail**: non-TTY, TTY and topology cases (*"the marker must be emitted exactly once"*)
  - clamp removed (+ in-place forced, otherwise the fitting phase cannot expose it) → **fail**: 5 cases including the pipe case (*"a non-TTY stdout receives no cursor-up escapes"*)
  - baseline and restored runs both exit 0 → every assertion is load-bearing
  - Note: two first-attempt mutations were **no-ops** (they patched code not on the active path) and were replaced with effective ones rather than reported as "caught" — recorded here for honesty
- [x] T2.14 — Marker-count evidence measured directly on the module (see the table below)
- [x] T2.15 — Every acceptance criterion verified; log below

## Phase 3 — Documentation and Closing

- [x] T3.1 — `CHANGELOG.md` `[Unreleased] → Fixed`: thinking-stream duplication, the two strategies, the shared clamp module, the marker-count test method
- [x] T3.2 — `docs/deep-dive.md`: **§ 7.4** heading → "Correção aplicada (2026-10-10, P0-1)" with the implemented design written out and the original sketch labelled as historical; **§ 7.2** gains a "corrigido em 2026-10-10" note and keeps its pre-fix line numbers as the diagnosis record; **§ 6.1** renderer row rewritten (strategy + range); **§ 6.2** atomicity sentence refreshed; **§ 20** "Cursor-up frame redraw" row drops the `thinking.js` defect note (both files now clamped; `turn-keys.js` still uncited for a fix); **§ 21.1** P0-1 marked ✅ applied
- [x] T3.3 — Rule 7.4: `features/terminal-ui.md` Change History row + a new "Thinking stream rendering" technical row; `docs/architecture.md` `ui/` row names `terminal-cursor.js` and states the clamp/append-only guarantee
- [x] T3.4 — Rule 5 revalidation: every touched table row re-counted against its **own** enclosing header (`§ 6.1` 5=5, `§ 20` 4=4, `§ 21` 6=6, `features` 4=4 and 3=3); no Mermaid block created or edited; all `thinking.js` citations checked in range against the 318-line file (5 citations, 0 out of range)
- [x] T3.5 — Spec and plan status → `implemented`
- [x] T3.6 — Committed on `development` with explicit paths only (Rule 8); hash recorded below
- [x] T3.7 — Limitations and residual risk recorded below

---

## Acceptance Criteria Verification Log

| AC | Status | Evidence (how it was verified) |
|----|--------|--------------------------------|
| AC-01 | ✅ | Case A: marker **1**, cursor-ups **0**; mutation-verified (latch removed ⇒ duplication + escapes) |
| AC-02 | ✅ | Case B: marker **1**, cursor-ups **2** with max **9** (≤ 23), none after the latch, none in the end call |
| AC-03 | ✅ | Case C: end write = `\n` + footer, zero cursor-up escapes; mutation-verified |
| AC-04 | ✅ | Case D: cursor-up present (in-place path) and the final frame paints the block once |
| AC-05 | ✅ | Case E: one ghost start line + one close line, no body, climb ≤ 1 |
| AC-06 | ✅ | `test/prompt-input-render.test.js` **20/20** after the verbatim extraction; `test/thinking-during-active-turn.test.js` also green (it caught the separate-write regression, which was then fixed properly) |
| AC-07 | ✅ | `node --check` ×3 clean; targeted 30/30; full suite 396/386 pass/exit 0; lint 0 errors / 144 warnings (baseline) |
| AC-08 | ✅ | Case G: second stream redraws in place; state reset in both stream boundaries (mutations of the latch path are caught by the same tests) |
| AC-09 | ✅ | CHANGELOG + deep-dive § 6.1/§ 6.2/§ 7.2/§ 7.4/§ 20/§ 21.1 + `features/terminal-ui.md` (2 rows) + `docs/architecture.md`; tables and citations revalidated |

## Marker-count evidence (measured on the module)

| Case | stdout | marker occurrences | cursor-up emissions | max climb | above `rows-1` |
|------|--------|--------------------|---------------------|-----------|----------------|
| A | `isTTY = false` (pipe) | **1** | 0 | — | 0 |
| B | TTY, `rows = 24` | **1** | 2 (fitting phase only) | **9** | 0 |

210-line stream, 30 deltas, marker on line 101 of 211. Before the fix the same feed produced one copy of the marker per delta in append-less mode (the reported symptom).

## Verification Log (commands and results)

| Command | Result |
|---------|--------|
| `npm test` (pre-change baseline) | 387 / 377 pass / 0 fail / 10 skipped / exit 0 |
| `npm run lint` (pre-change baseline) | 144 problems (0 errors, 144 warnings) |
| `node --check src/ui/thinking.js src/ui/terminal-cursor.js src/ui/prompt-input-persistent.js` | exit 0 |
| `node --test test/thinking-stream-append.test.js` | **9 / 9 pass** |
| `node --test` (new + render + active-turn) | **30 / 30 pass** |
| mutation matrix (3 effective mutations) | each ⇒ exit 1 with the expected failing tests; baseline/restored ⇒ exit 0 |
| `npm run lint` (post-change) | 144 problems (0 errors, 144 warnings) — unchanged |
| `npm test` (post-change) | **396 / 386 pass / 0 fail / 0 cancelled / 10 skipped / exit 0** |
| marker evidence script | Case A: 1 marker / 0 climbs; Case B: 1 marker / max climb 9 |

## Limitations / Residual Risk

- **Interactive smoke not executed**: a live reasoning model (`node bin/emile.js` with a thinking-capable model) is not available here, so the real end-to-end visual check is left to the user. The substitute evidence is strong: the marker-count suite (which reproduces the failure mode deterministically) plus the lease-aware `thinking-during-active-turn.test.js`.
- **One row can briefly look stale** when a delta re-flows a word onto a row that was already emitted (append-only cannot rewrite a scrolled row). Bounded to a single row, never duplicated text; documented in spec § 7 and inherent to the append-only strategy (§ 7.4 acknowledges the partial-growth case).
- **`rows || 50` for the fit check vs `rows || 24` for the clamp**: deliberately independent magnitudes (heuristic headroom vs hard bound). A wrong estimate degrades to append-only (correct output), never to a redraw.
- **Reported, not fixed (Rule 6.2):** `src/ui/turn-keys.js` (`:73`, `:78`, `:91`) still emits cursor-ups with no `rows` clamp and no non-TTY guard — it is the last member of this family, uncovered by any brief; `src/ui/model-picker.js:145` and `src/ui/prompt-input.js:192,234,242,365` share the pattern; the response streamer (`response.js`) is a separate § 7.4 item.
- **Pre-existing Markdown defect reported, not fixed:** `docs/deep-dive.md` § 21 line 543 (the **P2-8** row) has 8 pipes against a 5-column header because `|| 40` sits unescaped inside a code span — introduced by the 2026-10-08 P2-8 session, unrelated to this change.
- **Foreign working-tree files left untouched:** `prompt-paste-text.txt` (8.6 KB paste-test dump) and `l.includes('` (0-byte stray) are untracked artifacts from another session — neither staged nor deleted.

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| `57058b4` | `fix(ui): render the thinking stream append-only with a viewport-clamped erase` | `src/ui/thinking.js`, `src/ui/terminal-cursor.js`, `src/ui/prompt-input-persistent.js`, `test/thinking-stream-append.test.js`, `specs/2026-10-10-thinking-append-only/*`, `CHANGELOG.md`, `docs/architecture.md`, `docs/deep-dive.md`, `features/terminal-ui.md` |