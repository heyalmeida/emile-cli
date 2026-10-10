# Tasks: Large-paste duplication fix — coalesce the paste burst, clamp the prompt redraw

| Field | Value |
|-------|-------|
| **Spec** | `2026-10-09-paste-burst-redraw` |

---

## Phase 0 — Preparation

- [x] T0.1 — Read relevant documentation (PRD, architecture, visual identity, ADRs) — *Rule 1 of `.clinerules`* — read: `.clinerules`, brief P0-4 + `_shared-constraints.md`, `docs/deep-dive.md` § 19/§ 20/§ 21.1/§ 22.1–22.2/§ 7.2, `docs/code-quality-and-security.md` § 1–2, `docs/visual-identity.md` (Input prompt row), `features/terminal-ui.md`, `specs/2026-09-02-prompt-paste/spec.md`, `specs/README.md`, `specs/_templates/*`, the full `src/ui/prompt-input-persistent.js` and `test/prompt-input-render.test.js`
- [x] T0.2 — Confirm this spec and plan are `approved` — both headers set to `approved` before any code was written (Rule 3 order: spec → plan → tasks → code); flipped to `implemented` at close
- [x] T0.3 — Classify risk, map threat surfaces and confirm the plan's gates — **Low** (pure `src/ui/` rendering + input lifecycle; no execution, paths, credentials or LLM input per `docs/code-quality-and-security.md` § 1); negative criteria in spec § 4 / plan § 3; gates in plan § 8
- [x] T0.4 — Confirm the current branch is `development` and inspect `git status`; do not switch branches or create a worktree — *Rule 8* — `git branch --show-current` → `development`; foreign working-tree paths (`integrations/`, `skills-lock.json`) left untouched and **not** staged

## Phase 1 — Implementation

- [x] T1.1 — Module-level paste-burst constants (`PASTE_BURST_WINDOW_MS = 2`, `PASTE_BURST_QUIET_MS = 10`, `PASTE_BURST_MIN_KEYS = 3`) + `isTextKeypress()` predicate driven by the `NON_TEXT_KEY_NAMES` denylist (mirrors every non-text branch; Enter deliberately **not** pasteable) *(verifies RF-S02, RF-S07, RF-S08)* — evidence: `src/ui/prompt-input-persistent.js:99-141`; `Enter after a burst still submits the draft` test green
- [x] T1.2 — Viewport-clamped cursor-up helpers `viewportCursorUp()` / `writeCursorUp(rows)`: `Math.min(rows, Math.max((process.stdout.rows || 24) - 1, 0))`, no emission when `!process.stdout.isTTY`; used by `erasePreviousBlock()` **and** the `render()` reposition *(verifies AC-03, AC-04, RF-S03, RF-S04)* — evidence: `:129-146`, call sites `:397-405` and `:446-449`; clamp + non-TTY tests green
- [x] T1.3 — Render arbitration: `render()` records an owed frame (`renderDeferred`) and returns while `isPasting || burstDeferred`; otherwise clears the owed flag and the quiet timer. The busy/`submitInFlight` early-return stays **first**, so ADR-0003 output ownership is untouched *(verifies AC-01, AC-02, RF-S01)* — evidence: `:407-421`; ≤2 renders asserted for a 500-char/20-Enter paste
- [x] T1.4 — Burst tracking inside `persistentPromptInput`: `trackPasteBurst()` (`Date.now()` gap test), `scheduleBurstFlush` via a 10 ms `setTimeout(...).unref()`, `endBurst()` flush on the first non-text key, single `render()` on `paste-end`, bracketed `paste-start` folds any open burst into the owed frame, and `suspendInput()`/`shutdown()` clear timer + flags *(verifies AC-01, AC-02, AC-05, AC-07, RF-S01, RF-S02, RF-S10)* — evidence: `:366-395`, `:462-471`, `:532-540`, `:554-580`; four new burst tests green
- [x] T1.5 — Public API and layout untouched: `persistentPromptInput`, `buildPromptLayout`, `clipLine`, `matchPromptCommands`, `matchPromptMentions`, `PROMPT_MATCH_LIMIT`, `buildPromptFooterSegments` unchanged in signature and semantics; `git diff` shows no edit inside `buildPromptLayout`/`clipLine` *(verifies AC-09, RF-S05, RF-S06)* — evidence: `node -e import('./src/ui/index.js')` loads the barrel (66 exports) and `persistentPromptInput` is present; existing layout/clip tests green untouched

> Commit as each coherent unit completes, staging ONLY this feature's files (Rule 8). Record the commit hashes below.

## Phase 2 — Testing, Security and Verification

- [x] T2.1 — Harness: `withFakeTerminal(t, columns, rows)` now pins `process.stdout.isTTY = true` and an explicit `rows` (default 40) and restores every descriptor in `t.after`; Buffer writes are still forwarded to the real stdout (F4 behavior preserved, harness protocol intact) *(enables AC-03/AC-04 determinism)* — evidence: `test/prompt-input-render.test.js:84-123`; suite reports all tests (no lost results)
- [x] T2.2 — Case A (bracketed): `paste-start` + 500+ chars / 20 Enters, char-by-char + `paste-end` → ≤2 full-block renders (counted by `╭` top borders), every pasted line exactly once, complete draft reconstructed once, `wrapped === false` *(verifies AC-01)* — evidence: `bracketed paste coalesces into a single render` PASS (2.2 ms of 20-test run)
- [x] T2.3 — Case B (non-bracketed burst): 200 synchronous keypresses, no markers → render delta <10 and text once; plus owed-frame-before-next-edit-key and lone-Enter-submits cases *(verifies AC-02, AC-05, AC-08-adjacent)* — evidence: `non-bracketed keypress burst is coalesced`, `a burst flushes before the next editing key acts`, `Enter after a burst still submits the draft` — all PASS
- [x] T2.4 — Case C (rows clamp): `rows = 10` + 30-line draft pasted, then two forced redraws → every `ESC[nA` parsed from raw writes is ≤ 9; copies of a line bounded by the render count (height overflow degrades to scroll) *(verifies AC-03)* — evidence: `cursor-up is clamped to the terminal viewport` PASS
- [x] T2.5 — Case D (non-TTY): `process.stdout.isTTY = false` → zero `ESC[nA` in the writes while the draft still reaches stdout *(verifies AC-04)* — evidence: `non-TTY stdout never receives a cursor-up` PASS
- [x] T2.6 — Case E (cleanup): Ctrl+C with an open burst → write count frozen after shutdown, `?2004l` still emitted *(verifies AC-07)* — evidence: `a coalesced burst never survives cleanup` PASS
- [x] T2.7 — Case F (regression): all 13 pre-existing tests pass. Two of them assert on state that a 4-key and a 120-key synchronous run now legitimately coalesce, so each gained **one line** — `await burstSettled()` before the assertion (no assertion changed, weakened or deleted): `long input lines are clipped, never wrapped` (120 keys are a paste burst, not a typist) and `backspace and narrowing keep the screen residue-free` (`/web` was no longer on screen when the menu was asserted). *(verifies AC-06, AC-08)* — evidence: `node --test` → 20 tests / 20 pass / 0 fail, including `bracketed multiline paste stays editable until a separate Enter`
- [x] T2.8 — `node --check src/ui/prompt-input-persistent.js` → clean (exit 0, `SYNTAX_OK` printed alongside the test check)
- [x] T2.9 — `node --test test/prompt-input-render.test.js` → **20 tests, 20 pass, 0 fail, 0 skipped**
- [x] T2.10 — `npm run lint` → **145 → 144 problems (0 errors, 144 warnings)** — the one new warning introduced by this change (unused binding in the new test loop) was fixed, so the count matches the pre-change baseline exactly; `npm test` → **363 tests, 353 pass, 0 fail, 0 cancelled, 10 skipped (Windows env-skips), exit code 0**
- [x] T2.11 — `npm audit` — **not applicable**: no dependency added (Rule 6.3 / ADR-0001); `package.json` and `package-lock.json` are untouched (`git status` clean for both)
- [x] T2.12 — Verify ALL acceptance criteria, one by one — log below
- [x] T2.13 — Additional gates per Rule 6.3: `node bin/emile.js --help` (exit 0, module graph loads with the change) and `node -e "import('./src/ui/index.js')"` (barrel loads, `persistentPromptInput` exported). The interactive smoke (`node bin/emile.js --verbose` on a real task) needs a TTY + credentials, which this environment lacks — recorded as a limitation in T3.7 instead of claimed as verified.

## Phase 3 — Documentation and Closing

- [x] T3.1 — Rule 2 sync: `CHANGELOG.md` `[Unreleased] → Fixed` (large-paste duplication, coalescing + viewport-clamped erase); `docs/deep-dive.md` § 22.2 marked **✅ FIX APLICADO 2026-10-09**, § 20 "Cursor-up frame redraw" row rewritten (prompt clamped; `thinking.js` + `turn-keys.js` still uncapped → P0-1), § 21.1 P0-4 row marked applied; `docs/visual-identity.md` Input-prompt row (paste paints one frame, clamped cursor-up)
- [x] T3.2 — `features/terminal-ui.md` (Rule 7.4 — existing feature, no new file): Change History row + "Prompt lifecycle" technical-details row updated; `features/README.md` index row already points at this feature and needs no change
- [x] T3.3 — CHANGELOG entry recorded (part of T3.1)
- [x] T3.4 — Revalidate touched Mermaid blocks: **no Mermaid block was created or edited** by this change (`features/terminal-ui.md`'s flowchart untouched); edited table rows verified to keep their column counts (Rule 5) — 4 pipes for the 3-column tables, 7 for the § 21.1 backlog table
- [x] T3.5 — Spec and plan status → `implemented` / code delivered and verified
- [x] T3.6 — Commit on `development` with only explicit paths staged (Rule 8): spec pack + `src/ui/prompt-input-persistent.js` + `test/prompt-input-render.test.js` + the four doc files; foreign paths (`integrations/`, `skills-lock.json`) left unstaged. The commit hash is then recorded in this file as a one-file closeout row (Rule 8 allows documentation-only commits on `development`)
- [x] T3.7 — Handoff limitations recorded below

---

## Acceptance Criteria Verification Log

| AC | Status | Evidence (how it was verified) |
|----|--------|--------------------------------|
| AC-01 | ✅ | New test `bracketed paste coalesces into a single render`: 500+ chars / 20 Enters, render delta (top-border `╭` count) ≤2, `visibleInputText(emu) === payload`, each line once, `wrapped === false` — PASS |
| AC-02 | ✅ | New test `non-bracketed keypress burst is coalesced`: 200 marker-less keys → render delta <10 and text exactly once — PASS |
| AC-03 | ✅ | New test `cursor-up is clamped to the terminal viewport`: `rows = 10`, 30-line draft, all raw `ESC[nA` parsed → every `n ≤ 9` — PASS |
| AC-04 | ✅ | New test `non-TTY stdout never receives a cursor-up`: `isTTY = false` → `cursorUps(writes)` deep-equals `[]` while the draft text still appears — PASS |
| AC-05 | ✅ | New tests `a burst flushes before the next editing key acts` (backspace sees `hell` after the owed frame) and `Enter after a burst still submits the draft` (`onSubmit` got `abc`) — PASS; plus pre-existing Tab/`/switch`/backspace-narrowing/Shift+Enter tests green |
| AC-06 | ✅ | Pre-existing `bracketed multiline paste stays editable until a separate Enter` unchanged and PASS; AC-01 test also asserts the post-paste Enter submits the full payload |
| AC-07 | ✅ | New test `a coalesced burst never survives cleanup`: write count frozen at shutdown, `?2004l` still emitted — PASS |
| AC-08 | ✅ | `node --test test/prompt-input-render.test.js` → 20/20; `npm test` → 363 tests, 0 fail, exit 0; `npm run lint` → 0 errors, 144 warnings (= baseline count) |
| AC-09 | ✅ | `node --check` clean; `git diff` shows no edit inside `buildPromptLayout`/`clipLine`; `src/ui/index.js` barrel imports fine and still exports `persistentPromptInput`; width/layout tests untouched and green |
| AC-10 | ✅ | CHANGELOG Fixed entry; deep-dive § 22.2 applied marker + § 20 row + § 21.1 P0-4 row; `features/terminal-ui.md` history + technical-details rows; `docs/visual-identity.md` input-prompt row — all verified present by string search and table-column check |

## Verification Log (commands and results)

| Command | Result |
|---------|--------|
| `npm test` (pre-change baseline) | 356 tests / 346 pass / 0 fail / 10 skipped — the recorded "324" baseline was stale; this is the real starting point |
| `node --check src/ui/prompt-input-persistent.js` | exit 0 (clean) |
| `node --test test/prompt-input-render.test.js` | **20 tests / 20 pass / 0 fail / 0 skipped** (13 pre-existing + 7 new) |
| `npm run lint` | **0 errors, 144 warnings** — identical to the pre-change warning count (one transient new warning was fixed before closing) |
| `npm test` (post-change) | **363 tests / 353 pass / 0 fail / 0 cancelled / 10 skipped / exit 0** (= baseline + the 7 new tests) |
| `node bin/emile.js --help` | exit 0, usage printed — module graph loads with the change |
| `node -e "import('./src/ui/index.js')"` | 66 exports, `persistentPromptInput` present |
| `npm audit` | not applicable — no new dependency; `package.json` untouched |

## Known Limitations / Residual Risk

- **Interactive smoke not executed**: a real TTY paste (`node bin/emile.js` + Ctrl+V of a 2 KB prompt) cannot be driven from this environment (no interactive terminal, no credentials). The automated ANSI-emulator cases A–E are the substitute evidence; a manual confirmation in the user's Windows console is still worth doing.
- **Taller-than-viewport drafts still leave copies in the scrollback** — by design, and now bounded by the *render count* instead of the *character count*. Removing it entirely requires the viewport-budgeted layout (out of scope).
- **Burst detection is timing-based** (2 ms window): a terminal that delivers a paste as one-key reads spaced wider than that falls back to per-key renders — pre-fix behavior, but no duplication because the erase is clamped.
- **Out of scope, reported not fixed** (Rule 6.2): `turn-keys.js:73,78,91`, `thinking.js:103,122,150,153`, `prompt-input.js:192,234,242,365` and `model-picker.js:145` all still emit uncapped `ESC[nA`.

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| `c839957` | `fix(ui): coalesce paste bursts and clamp prompt redraw to the viewport` | `src/ui/prompt-input-persistent.js`, `test/prompt-input-render.test.js`, `specs/2026-10-09-paste-burst-redraw/` (spec+plan+tasks), `CHANGELOG.md`, `docs/deep-dive.md`, `docs/visual-identity.md`, `features/terminal-ui.md`, `specs/2026-10-08-deep-dive-backlog/README.md` |

> Staged with explicit paths only (Rule 8). The foreign untracked working-tree paths (`integrations/`, `skills-lock.json`) were deliberately left unstaged.

