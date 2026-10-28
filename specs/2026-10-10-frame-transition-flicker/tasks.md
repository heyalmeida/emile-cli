# Tasks: Atomic active-turn frame transition (no flicker while streaming)

> Fill in from the `plan.md`. Each task must be small, verifiable and traceable to an acceptance criterion (AC). Mark `- [x]` only after verifying.

| Field | Value |
|-------|-------|
| **Spec** | `2026-10-10-frame-transition-flicker` |

---

## Phase 0 — Preparation

- [x] T0.1 — Read the relevant documentation (deep-dive § 6/§ 19/§ 21.1, architecture ui/ row + ADR-0003, visual identity, the P1-16 brief) and re-verify F1–F8 against the tree — *Rule 1*
- [x] T0.2 — Confirm the spec and plan are approved
- [x] T0.3 — Classify risk (Medium: the live frame is load-bearing; no data, no paths, no secrets)
- [x] T0.4 — Confirm the branch is `development` and inspect `git status` — *Rule 8*
- [x] T0.5 — Baseline: `npm test` 470 / 460 pass / 0 fail / 10 env skips; `npm run lint` 0 errors (144 warnings)

## Phase 1 — Implementation

- [x] T1.1 — `src/ui/turn-keys.js`: `createLiveInput` composes chunks instead of writing them (`takeEraseChunk`, `buildFrame`, `markDrawn`, `isOnScreen`), keeping the frame geometry across an erase — *(prep for AC-01…AC-05)*
- [x] T1.2 — Bounded erase: climb to the frame top, clear each of its own rows with `ESC[K` stepping with `ESC[1B`, then `ESC8`; `ESC[0J` deleted — *(AC-02)*
- [x] T1.3 — Transition machinery: `openUpdate`/`closeUpdate` on the exported `SYNCHRONIZED_BEGIN`/`END` + `shouldEmitSynchronizedOutput` (one decision for both markers), `flushTransition` on a `setImmediate`, `paintFrame` as the single repaint path — *(AC-01, AC-03)*
- [x] T1.4 — `interceptedWrite` wraps the whole `erase → chunk(s) → redraw` region, counts what the chunk did to the cursor, and defers the redraw; empty writes are passed through untouched — *(AC-01, AC-05)*
- [x] T1.5 — Coalescing ordering: a keypress settles an owed redraw before it acts on the draft; `cleanup()` drops the owed redraw, erases the frame and closes the update in one write — *(AC-01)*
- [x] T1.6 — Conditional reservation via the in-place proof (`inPlace`: zero down-moves + no wrap + no growth), documented with the drift example that rejects the estimator — *(AC-05)*
- [x] T1.7 — `src/ui/prompt-input-persistent.js`: `eraseChunk()` walks the block's own rows and returns to the top (F6), with the return climb clamped (found by the non-TTY suite) — *(AC-02)*

## Phase 2 — Testing, Security and Verification

- [x] T2.1 — Render-suite harness: emulator consumes `ESC[1B`, `ESC7`/`ESC8` and the private-mode pair
- [x] T2.2 — New proxy cases in `test/prompt-input-render.test.js`: burst → one pair + one draw; hide → no `ESC[0J`, clears equal to the frame rows; identical frame → zero bytes; tmux and non-TTY guards; in-place vs unprovable reservation — *(AC-01…AC-05)*
- [x] T2.3 — Fixed the other two emulators (`turn-keys-visibility`, `thinking-during-active-turn`) to consume the private-mode pair they would otherwise leak as text, and moved that suite's per-write redraw count to the new contract with stronger invariants
- [x] T2.4 — `node --check` on both touched modules
- [x] T2.5 — Six suites: `prompt-input-render` 39, `thinking-stream-append` 9, `turn-input-cap` 14, `commit-frontier` 15, `turn-keys-visibility` 5, `thinking-during-active-turn` 1 → 83/83
- [x] T2.6 — `npm test` 477 / 467 pass / 0 fail / 10 env skips; `npm run lint` 0 errors (144 warnings, unchanged) — *(AC-06)*
- [x] T2.7 — Verified every acceptance criterion (log below)

## Phase 3 — Documentation and Closing

- [x] T3.1 — Rule 2 sync: `CHANGELOG.md` `[Unreleased]` → Fixed; `docs/architecture.md` (ui/ row: the frame-transition contract); `docs/deep-dive.md` (§ 6.2 rewritten, new § 6.3 with the reservation rule, § 19 note, three § 20 pattern rows, § 21.1 P1-16 closed with what stayed out); `features/terminal-ui.md` (detail row + Change History + source spec)
- [x] T3.2 — Feature registry updated (`features/terminal-ui.md` — improvement to an existing feature)
- [x] T3.3 — CHANGELOG entry recorded
- [x] T3.4 — Mermaid: none added or edited; the touched tables were re-checked (the 5 pre-existing escaped-pipe rows in `deep-dive.md` are unchanged, only renumbered)
- [x] T3.5 — Spec status set to `implemented`
- [x] T3.6 — Committed on `development` with explicit paths
- [x] T3.7 — Handoff records the model-picker report, the reservation deviation and the CI-untestable flicker

---

## Acceptance Criteria Verification Log

| AC | Status | Evidence (how it was verified) |
|----|--------|--------------------------------|
| AC-01 | ✅ | Probe over a real lease: burst of 50 writes in one turn → `BEGIN=1 END=1 frameDraws=1`, and **0** frame draws before the settle. Test: "a burst of agent writes makes ONE synchronized frame transition". |
| AC-02 | ✅ | Same probe: `ESC[0J=0`, `eraseClears=4`, `cursorDowns=3`, `climbUps=1` for a frame that drew **4** rows — one clear per own row, stepped only within them. `grep` for `ESC[0J` across `src/` → 0 occurrences. Tests: "a frame hide erases only the frame own rows…"; the existing residue-free and caret cases stay green. |
| AC-03 | ✅ | Same probe: two `redraw()` calls on an unchanged frame emit **0 bytes**. Test: "an unchanged frame is not re-emitted while it is on screen". |
| AC-04 | ✅ | Tests: "the transition omits the synchronized markers under tmux" (frame still drawn, no `2026` marker) and "a non-TTY stdout receives neither marker nor cursor escape from the frame" (agent bytes only). |
| AC-05 | ✅ | Test: "the row reservation is emitted only when the redraw cannot prove it lands in place" — a no-newline spinner chunk produces a draw with no `\n`-run reservation, a `\n`-carrying chunk keeps it. Deviation from the brief's formula documented in the spec § 7 and the plan § 11 with the worked drift example. |
| AC-06 | ✅ | Six suites 83/83; `prompt-input-render` 32 → 39 (no case removed or weakened), `thinking-stream-append` 9, `turn-input-cap` 14, `thinking-during-active-turn` 1, `turn-keys-visibility` 5 (assertions strengthened); `npm test` **477 tests / 467 pass / 0 fail / 10 env skips**, exit 0; `npm run lint` 0 errors / 144 warnings (baseline unchanged). |
| AC-07 | ✅ | `CHANGELOG.md`, `docs/architecture.md`, `docs/deep-dive.md` (§ 6.2, § 6.3, § 19, § 20, § 21.1), `features/terminal-ui.md` inspected after the edits. |

> Legend: ⏳ pending / ✅ verified / ❌ failed (go back to implementation)

## Notes for the handoff

- **Not done (reported):** `model-picker.js`'s frame is still written row by row. Wrapping it needs the list composed before emitting (see the final report), which is component work, not frame-foundation work.
- **Deviation:** the brief's reservation formula was not implemented verbatim (drift risk, worked example in the plan). The implemented rule is strictly narrower: it only skips when the redraw is provably in place.
- **Untestable in CI:** the flicker itself (a property of what the terminal presents). The marker/erase/no-op counts are the proxy — stated in the spec.
- **Harness note:** `node:test`'s reporter writes its NDJSON protocol as strings to stdout, so during a leased turn those bytes travel through the transition like any other write. That is correct behaviour, but it forced the new assertions to isolate the module's own writes and to open/settle each measured transition inside one synchronous block.

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| (this commit) | `fix(ui): atomic active-turn frame transition (no flicker while streaming)` | `src/ui/turn-keys.js`, `test/prompt-input-render.test.js`, `test/turn-keys-visibility.test.js`, `test/thinking-during-active-turn.test.js`, `specs/2026-10-10-frame-transition-flicker/` |
| (this commit) | `fix(ui): bound the idle frame erase to the block's own rows` | `src/ui/prompt-input-persistent.js` (+ the render-suite cases that cover it) |
| (this commit) | `docs(ui): sync the atomic frame transition` | `CHANGELOG.md`, `docs/architecture.md`, `docs/deep-dive.md`, `features/terminal-ui.md` |