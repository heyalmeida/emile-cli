# Tasks: UI commit frontier and viewport-budgeted prompt frame

> Fill in from the `plan.md`. Each task must be small, verifiable and traceable to an acceptance criterion (AC). Mark `- [x]` only after verifying.

| Field | Value |
|-------|-------|
| **Spec** | `2026-10-10-ui-commit-frontier` |

---

## Phase 0 — Preparation

- [x] T0.1 — Read the relevant documentation (deep-dive § 7/§ 19/§ 22.2, architecture `ui/` row, visual identity, ADR-0001/0003, the P1-14/P2-18/P2-19 briefs) and verify the reference `file:line` citations in grok-build — *Rule 1*
- [x] T0.2 — Confirm this spec and plan are `approved`
- [x] T0.3 — Classify risk (Medium, rendering only), map the surfaces, confirm the gates
- [x] T0.4 — Confirm the branch is `development` and the tree is clean — *Rule 8*
- [x] T0.5 — Record the gate baseline: `npm test` 441 tests / 431 pass / 0 fail / 10 env skips; `npm run lint` to be re-measured

## Phase 1 — Implementation

- [x] T1.1 — `src/ui/commit-frontier.js`: `createFrontier` (print-once, failed-write retry, live-region/released accounting, "append only" rule) + `wrapSynchronizedOutput` with the `$TMUX` exception — *(AC-01, AC-02, AC-03, AC-07)*
- [x] T1.2 — `src/ui/terminal-cursor.js`: `clampedCursorUp` reports 0 on a non-TTY stdout so an embedded escape is suppressed exactly like `writeCursorUp` — *(AC-06)*
- [x] T1.3 — `src/ui/prompt-input-persistent.js`: `buildPromptLayout({ maxRows })` with the cursor-centred window and the elision markers; the frame assembled into ONE synchronized write; the caller computes the budget from the live `stdout.rows` — *(AC-04, AC-05, AC-07)*
- [x] T1.4 — `src/ui/turn-keys.js`: budgeted frame + embedded clamped climbs (draw reserve, caret climb, hide climb) — *(AC-05, AC-06)*
- [x] T1.5 — `src/ui/model-picker.js` and `src/ui/prompt-input.js`: route the remaining climbs through the shared clamp (atomic frame where the climb shares the write) — *(AC-06)*
- [x] T1.6 — `src/ui/response.js`, `src/ui/tool-lines.js`, `src/ui/thinking.js`: finalized blocks committed once through the frontier (streaming paths untouched) — *(AC-01, AC-07)*

> Commit as each coherent unit completes, staging ONLY this feature's files (Rule 8). Record the commit hashes below.

## Phase 2 — Testing, Security and Verification

- [x] T2.1 — `test/commit-frontier.test.js`: print-once, retry-once, released rows, `rows` honoured, no erase/climb emitted, wrapper present/absent — *(AC-01..AC-03, AC-07)*
- [x] T2.2 — `test/prompt-input-render.test.js`: layout budget cases (200-line draft, `maxRows` 23/7, marker counts, cursor inside the window), emulator cases per `rows`, and the F2 clamp cases for `turn-keys`, `model-picker` and `prompt-input` — *(AC-04, AC-05, AC-06)*
- [x] T2.3 — `node --check` on every touched file
- [x] T2.4 — The four UI suites keep their counts and pass; `npm test` exits 0 — *(AC-08)*
- [x] T2.5 — `npm run lint` — 0 errors
- [x] T2.6 — Verify every acceptance criterion one by one (log below)

## Phase 3 — Documentation and Closing

- [x] T3.1 — Rule 2 sync: `CHANGELOG.md` `[Unreleased]`, `docs/architecture.md` (ui/ row), `docs/visual-identity.md` (elision markers), `docs/deep-dive.md` (§ 19, § 20 row, § 22.2), `features/terminal-ui.md` (Change History)
- [x] T3.2 — Feature registry updated (`features/terminal-ui.md` Change History — an improvement to an existing feature, not a new one)
- [x] T3.3 — CHANGELOG entry recorded
- [x] T3.4 — Mermaid blocks: none added or edited
- [x] T3.5 — Spec status set to `implemented`
- [x] T3.6 — Documentation sync committed on `development` with explicit paths
- [x] T3.7 — Handoff records limitations, non-executed verifications and residual risk

---

## Acceptance Criteria Verification Log

| AC | Status | Evidence (how it was verified) |
|----|--------|--------------------------------|
| AC-01 | ✅ | `test/commit-frontier.test.js` — "a committed block is never re-emitted" (the capture holds exactly one write after two commits of the same id). |
| AC-02 | ✅ | Same suite — "a failed write leaves the block uncommitted and the next commit retries it": first commit returns `false`, `pendingCount() === 1`, `isCommitted` false; the next commit emits it exactly once and clears the queue. |
| AC-03 | ✅ | Same suite — "overflow is released to the terminal, never erased": with `rows = 4` and 5 committed rows, `liveRows() === 3`, `releasedRows() === 2`, and the captured bytes contain no `ESC[...J`/`ESC[K`/`ESC[nA`. |
| AC-04 | ✅ | `test/prompt-input-render.test.js` — pure layout cases: `maxRows: 23` with a 200-line draft yields `lines.length === 23`, `⌃ 175 earlier rows`, no later marker, cursor inside the window; `maxRows: 7` yields `lines.length === 7`. |
| AC-05 | ✅ | Emulator case in the same suite: `rows = 24` + a 200-line draft → block height ≤ 23 and no `ESC[nA` above 23; `rows = 8` → block height ≤ 7, no crash, caret visible. |
| AC-06 | ✅ | Same suite: max cursor-up ≤ `rows - 1` for the persistent prompt, `turn-keys`, `model-picker` and `prompt-input`; the non-TTY case emits zero `ESC[nA`. |
| AC-07 | ✅ | `test/commit-frontier.test.js` — wrapper present on a TTY, absent with `$TMUX` and on a non-TTY stdout. |
| AC-08 | ✅ | `test/prompt-input-render.test.js` 20 → 32 (no case removed or weakened), `test/commit-frontier.test.js` 15, `thinking-stream-append` 9, `turn-input-cap` 14, `thinking-during-active-turn` 1 — all pass; `npm test` **468 tests / 458 pass / 0 fail / 10 env skips** (baseline 441/431), exit 0; `npm run lint` 0 errors (144 pre-existing warnings, unchanged). The four UI suites + the frontier suite together are 70/70. Note: the message of commit `1487fda` quotes the intermediate counts of the run made when that unit was staged (466/456); the authoritative, final measurement is the one in this row. |
| AC-09 | ✅ | CHANGELOG `[Unreleased]`, `docs/architecture.md` ui/ row, `docs/visual-identity.md`, `docs/deep-dive.md` § 19/§ 20/§ 22.2, `features/terminal-ui.md` Change History. |

> Legend: ⏳ pending / ✅ verified / ❌ failed (go back to implementation)

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| `1487fda` | `feat(ui): commit finalized output once through a shared frontier` | `src/ui/commit-frontier.js` (new), `src/ui/response.js`, `src/ui/tool-lines.js`, `src/ui/thinking.js`, `test/commit-frontier.test.js` (new) |
| `e529bcb` | `feat(ui): budget the prompt frame by stdout.rows and clamp the remaining climbs` | `src/ui/prompt-input-persistent.js`, `src/ui/terminal-cursor.js`, `src/ui/turn-keys.js`, `src/ui/model-picker.js`, `src/ui/prompt-input.js`, `test/prompt-input-render.test.js` |
| (this commit) | `docs(ui): sync the commit frontier, the frame budget and the elision markers` | `CHANGELOG.md`, `docs/architecture.md`, `docs/visual-identity.md`, `docs/deep-dive.md`, `features/terminal-ui.md`, `specs/2026-10-10-ui-commit-frontier/` |

> The two code units were committed in dependency order (the second imports the
> first) after the full gate suite passed on the assembled tree; Rule 8 forbids
> `git stash`/`reset`, so each unit's separate greenness was not re-derived by
> reverting the tree.