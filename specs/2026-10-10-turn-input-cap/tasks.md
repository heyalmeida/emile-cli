# Tasks: Input typed during a running turn is no longer silently truncated

| Field | Value |
|-------|-------|
| **Spec** | `2026-10-10-turn-input-cap` |

---

## Phase 0 — Preparation

- [x] T0.1 — Read relevant documentation — *Rule 1* — `.clinerules`, brief P1-13 + `_shared-constraints.md`, `docs/deep-dive.md` § 19/§ 21.1/§ 22.3 (steering row), `docs/code-quality-and-security.md` § 1–3, `docs/architecture.md` (`ui/` row), `docs/visual-identity.md`, ADR-0001/0003, `features/terminal-ui.md`, `specs/README.md`, `specs/_templates/*`; full reads of `src/ui/turn-keys.js`, `src/cli.js:350-400`, `buildPromptFooterSegments` in `src/ui/prompt-input-persistent.js`, `isShiftEnterKey` in `src/ui/prompt-input.js`, `test/turn-keys-visibility.test.js`, `test/prompt-input-render.test.js`
- [x] T0.2 — Spec and plan `approved` before any code (Rule 3 order spec → plan → tasks → code); flipped to `implemented` at close
- [x] T0.3 — Risk classified **Low-Medium** (pure input handling, raised by the data-loss dimension); negative criteria in spec § 4; gates in plan § 8
- [x] T0.4 — Branch `development` (`git branch --show-current`); the untracked `prompt-paste-text.txt` is the user's own capture and was left untouched (Rule 8)
- [x] T0.5 — Baseline recorded on the start commit: `npm test` → **396 tests / 386 pass / 0 fail / 10 skipped / exit 0**; `npm run lint` → **144 problems (0 errors, 144 warnings)**
- [x] T0.6 — Facts verified in code: `MAX_BUFFER_CHARS = 400`; the insert gate plus `text.slice(0, available)`; the same gate on paste-Enter and Shift+Enter; `sanitizeLine`'s `[^\S\n]+` collapse, `.trim()` and slice; the 90-char preview in `cli.js`; the idle prompt having no cap
- [x] T0.7 — Confirmed the barrel line for `listenTurnKeys` (`src/ui/index.js:24`) and that no test covered the active-turn draft cap before this change

## Phase 1 — Implementation

- [x] T1.1 — `src/ui/turn-keys.js:37` — `export const TURN_INPUT_MAX_CHARS = 16_000` documented as a memory guard, not a UX limit *(verifies RF-S01)*
- [x] T1.2 — `boundDraft` helper (`:47-63`, exported) drops the oldest characters and moves the cursor with them; `setBoundDraft` (`:220-239`) applies it and prints the notice once per turn guarded by `truncationNoticed` *(verifies RF-S02, RF-S03, RF-S04)*
- [x] T1.3 — All three growth paths rewired: text insertion accepts the whole chunk then bounds (`:381-389`), paste-Enter and Shift+Enter insert `\n` then bound (`:293-304`); the hard `< MAX` gates are gone *(verifies RF-S02, RF-S04, AC-07)*
- [x] T1.4 — `sanitizeLine` (`:93-100`) keeps CRLF normalization, control-character replacement and the cap slice; drops the whitespace collapse and `.trim()`; the empty-draft decision moved to the submit site (`line.trim().length > 0`) *(verifies RF-S06, RF-S07, RF-S09, AC-03, AC-04)*
- [x] T1.5 — Footer counter appended in `createLiveInput.drawFrame` (`:119-125`) through the existing `buildPromptFooterSegments` array at >80 % of the cap *(verifies RF-S05, AC-05)*
- [x] T1.6 — `formatQueuePreview` (`:69-72`, exported, pure) carries the `… (+N chars)` marker; re-exported from `src/ui/index.js:24` and used by `cli.js:371` *(verifies RF-S08, AC-06)*
- [x] T1.7 — Nothing else moved: `listenTurnKeys` signature, the frame/hide machinery, the lease, the P0-4 burst coalescing and `persistentPromptInput`'s state machine are untouched (`cli.js` gained 1 line, `turn-keys.js` grew only in the draft/limit code) *(verifies RF-S10, RF-S11, AC-08)*

## Phase 2 — Testing, Security and Verification

- [x] T2.1 — New `test/turn-input-cap.test.js` with the established harness (fake stdin EventEmitter, swapped `process.stdin`, captured `process.stdout.write`, `isTTY`/`columns`/`rows` pinned and restored). The harness registers teardown on a **LIFO stack**: `t.after` runs in registration order, which silently restored stdout to a stale stub once a test staged two turns and swallowed the runner's own TAP output (diagnosed and fixed during this task)
- [x] T2.2 — 20 000-char paste → queued length exactly 16 000, tail is the newest text, notice printed exactly once *(verifies AC-01)*
- [x] T2.3 — Second paste appends and trims the head → leading-A count 11 000, queued === 11 000 A + the new B *(verifies AC-02)*
- [x] T2.4 — Typing at the cap still lands; a deletion at the cap still applies *(covers the cursor math in `boundDraft`)*
- [x] T2.5 — Tabs and internal double spaces survive byte-identically *(verifies AC-03)*
- [x] T2.6 — BEL/ESC/BS/C1 are still replaced; CRLF normalizes without other rewriting; a whitespace-only draft is not queued *(verifies AC-04, RF-S09)*
- [x] T2.7 — Footer counter present past 80 % and absent below it *(verifies AC-05)*
- [x] T2.8 — `formatQueuePreview` marker for a long line, none for a short one, display-only flattening *(verifies AC-06)*
- [x] T2.9 — Bracketed paste of 60 lines keeps all 59 newlines; newlines keep landing once the cap is reached *(verifies AC-07)*
- [x] T2.10 — `boundDraft` unit coverage including the cursor-inside-dropped-head clamp and empty/undefined input
- [x] T2.11 — Idle-prompt regression: an 8 681-char paste submits in full and never prints the active-turn notice *(verifies AC-08)*
- [x] T2.12 — `node --check src/ui/turn-keys.js src/cli.js src/ui/index.js` → exit 0
- [x] T2.13 — `node --test test/turn-input-cap.test.js` → **14/14**; neighbours (`turn-keys-visibility`, `prompt-input-render`, `thinking-stream-append`) → **48/48**
- [x] T2.14 — `npm run lint` → 0 errors / 144 warnings (baseline); `npm test` → 410 / 400 pass / 0 fail / exit 0
- [x] T2.15 — `npm audit` → not applicable: no dependency added
- [x] T2.16 — **Mutation matrix** (6 mutations, each reverted alone, source restored in a `finally`) — see the table below; every one is caught
- [x] T2.17 — Every acceptance criterion verified; log below

## Phase 3 — Documentation and Closing

- [x] T3.1 — `CHANGELOG.md` `[Unreleased] → Fixed`: the silent 400-char truncation, the 16k drop-oldest cap, the one-per-turn notice, the footer counter, the `(+N chars)` marker, the whitespace-integrity fix and the explicit behaviour change
- [x] T3.2 — `docs/deep-dive.md`: § 19 gains the applied note; § 21.1 **P1-13** marked ✅ applied with the new line references; the dated § 22.6 rejection note now names `MAX_BUFFER_CHARS` and states it was the pre-P1-13 revision
- [x] T3.3 — `features/terminal-ui.md`: Change History row + a new "Active-turn draft limit" technical row; `specs/2026-10-08-deep-dive-backlog/README.md` pack status row
- [x] T3.4 — Rule 0 citation repair: my edits shifted **9** citations into `turn-keys.js`/`cli.js` (turn-keys 304 → 401 lines, cli 509 → 510). Repaired by content-matching, including the bare `, N` continuation forms (`cli.js:358-371`, `444-466`) that a prefix-only pattern misses; each was spot-checked to land on its intended construct. Rule 5: touched table rows re-counted against **their own** enclosing header (P1-13 row 7 = header 7; features 3 = 3 and 4 = 4; pack 3 = 3); no Mermaid block created or edited
- [x] T3.5 — Spec and plan status → `implemented`
- [x] T3.6 — Committed on `development` with explicit paths only (Rule 8); hash recorded below
- [x] T3.7 — Limitations and residual risk recorded below

---

## Acceptance Criteria Verification Log

| AC | Status | Evidence (how it was verified) |
|----|--------|--------------------------------|
| AC-01 | ✅ | `a 20 000-char paste keeps the newest 16 000 chars and warns exactly once`: queued length **16 000**, queued === the newest 16 000 characters, notice occurrences **1**; mutation-verified (removing drop-oldest fails 6 tests, suppressing the notice fails 2) |
| AC-02 | ✅ | `a second paste appends and trims the head, never the newest text`: queued === 11 000 A + the new 5 000 B (exactly 4 000 oldest characters dropped) |
| AC-03 | ✅ | `tabs and internal double spaces survive into the queued line`: byte-identical to the draft; mutation-verified by re-adding the collapse (3 tests fail) and by re-widening the control range to include TAB (2 tests fail) |
| AC-04 | ✅ | `control characters are still replaced (safety preserved)`: `a\u0007b\u001bc\u0008d\u009be` → `a b c d e`, and no control character survives |
| AC-05 | ✅ | `the footer shows the draft counter past 80% of the cap and not below it`; removing the counter fails that test |
| AC-06 | ✅ | `the queue preview marks a truncated line with (+N chars)`: 1 200 chars → 90 shown + `… (+1110 chars)`; removing the marker fails that test |
| AC-07 | ✅ | `a bracketed paste keeps every pasted line, far beyond the old cap` (60 lines / 59 newlines intact) and `newlines keep landing after the cap is reached` |
| AC-08 | ✅ | `an 8.7 KB paste into the IDLE prompt still reaches the agent whole`: submitted length **8 681**, no active-turn notice; `prompt-input-render` 20/20, `thinking-stream-append` 9/9 |
| AC-09 | ✅ | `node --check` ×3 clean; new suite 14/14; neighbours 48/48; `npm test` 410/400 pass/0 fail/exit 0; lint 0 errors / 144 warnings (= baseline) |
| AC-10 | ✅ | CHANGELOG + deep-dive § 19/§ 21.1 + 9 repairs + `features/terminal-ui.md` (2 rows) + pack status; tables revalidated |

## Truncation evidence (measured on the module)

| Measure | Value |
|---------|-------|
| input pasted | 20 000 chars (4 000 A + 16 000 B) |
| cap (`TURN_INPUT_MAX_CHARS`) | 16 000 |
| **queued length** | **16 000** |
| queued === newest text | true (the 16 000 B's) |
| **notice occurrences** | **1** |
| notice text | `⚠ queued draft reached 16k chars — oldest text dropped` |

## Mutation matrix

| Mutation | Result |
|---|---|
| drop-oldest removed (draft grows past the cap, nothing said) | exit 1 — 6 tests fail (`the NEWEST text survived and the oldest 4 000 chars were dropped`, `the newest paste is intact at the tail`, …) |
| truncation notice suppressed | exit 1 — 2 tests fail (`the truncation notice is printed exactly once`) |
| whitespace collapsing restored | exit 1 — 3 tests fail (`the queued text is byte-identical to the draft`) |
| TAB stripped again (original control range) | exit 1 — 2 tests fail |
| footer counter removed | exit 1 — 1 test fails |
| preview marker removed | exit 1 — 1 test fails |
| baseline / restored state | exit 0 |

## Verification Log (commands and results)

| Command | Result |
|---------|--------|
| `npm test` (pre-change baseline) | 396 / 386 pass / 0 fail / 10 skipped / exit 0 |
| `npm run lint` (pre-change baseline) | 144 problems (0 errors, 144 warnings) |
| `node --check src/ui/turn-keys.js src/cli.js src/ui/index.js` | exit 0 |
| `node --test test/turn-input-cap.test.js` | **14 / 14 pass** |
| neighbours (`turn-keys-visibility`, `prompt-input-render`, `thinking-stream-append`) | **48 / 48 pass** (render suite still 20/20) |
| mutation matrix (6 mutations) | each ⇒ exit 1 with the expected failing tests |
| `npm run lint` (post-change) | 144 problems (0 errors, 144 warnings) — unchanged |
| `npm test` (post-change) | **410 / 400 pass / 0 fail / 0 cancelled / 10 skipped / exit 0** (= baseline 396 + 14 new) |
| citation audit | 9 shifted citations repaired and spot-checked |

## Limitations / Residual Risk

- **Interactive smoke not executed**: pasting a real brief into a live turn requires a running agent turn plus a manual clipboard paste, so the keypress-driven suite — which drives the real `listenTurnKeys` with the real stdout lease installed — stands in.
- **The queue still drains only between turns**: a message typed mid-turn does not steer the running turn. That is **P2-13**, untouched by design here.
- **A dropped head can cut mid-sentence** when the cap is reached. Strictly better than the previous head-keeping silent truncation, and now visible (one notice + footer counter). The deliberate policy is "keep what the user just pasted".
- **`turn-keys.js`'s uncapped cursor-up** (pre-change `:78`, `:91`; now `:151` and the `hideFrame` counterpart) remains **P2-19** — reported, not fixed.
- **The prompt block's missing height budget** (**P2-18**) is unaffected: a 16 000-char draft wraps into many rows and the layout still has no viewport budget.
- **`prompt-paste-text.txt`** in the repository root is the user's own untracked capture and was deliberately left alone (neither staged nor deleted).
- **One deliberate deviation from the brief's wording**, recorded for review: the brief asked to keep the control-character stripping "unchanged" while also requiring tabs to survive — impossible, because the original range `\u0000-\u0009` **includes TAB** (`0x09`). The range is now `\u0000-\u0008\u000b-\u001f\u007f\u0080-\u009f` (C0 except HT/LF, DEL and the C1 range). Everything that can carry a terminal escape is still replaced (asserted), and only TAB stops being collateral damage.

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| ⏳ (recorded after commit) | `fix(ui): stop silently truncating input typed during a running turn` | `src/ui/turn-keys.js`, `src/cli.js`, `src/ui/index.js`, `test/turn-input-cap.test.js`, `specs/2026-10-10-turn-input-cap/*`, `CHANGELOG.md`, `docs/deep-dive.md`, `features/terminal-ui.md`, `specs/2026-10-08-deep-dive-backlog/README.md` |