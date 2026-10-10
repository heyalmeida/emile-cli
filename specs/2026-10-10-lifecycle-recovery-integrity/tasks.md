# Tasks: Recovery, abort and shutdown integrity

| Field | Value |
|-------|-------|
| **Spec** | `2026-10-10-lifecycle-recovery-integrity` |

---

## Phase 0 — Preparation

- [x] T0.1 — Read the brief, `.clinerules`, deep-dive § 10/§ 18/§ 21.1, code-quality § 1–6, the architecture rows, ADR-0001/0002 and `src/memory/io.js` (atomic-write pattern)
- [x] T0.2 — Spec and plan written and `approved` before any code (Rule 3 order); flipped to `implemented` at close
- [x] T0.3 — Risk **High**; failure/rollback analysis written in spec § 4.1 before implementing
- [x] T0.4 — Branch `development`, `git status` inspected (Rule 8)
- [x] T0.5 — Baseline: `npm test` 410/400 pass/0 fail/10 skipped; `npm run lint` 0 errors / 144 warnings
- [x] T0.6 — Every reported fact re-verified in code (F1–F11): the two `'pending'` filters, the phantom `abandoned` read, the no-op `setPromptShutdown` injection, `\x1B[2J`+`\x1B[H` in phase 6, the re-entrant no-op, the two bare `writeFileSync` calls, and the dead `markAborted`/`moveToCorrupt`/`listPending`
- [x] T0.7 — Call-site audit: `listPending` and `moveToCorrupt` had zero callers; `markAborted` was referenced but never invoked by a phase; `flushSync` was consumed only by phase 3

## Phase 1 — Recovery vocabulary, abort, atomic writes

- [x] T1.1 — `recovery.js`: selects `tool_pending`; quarantines corrupt records through `moveToCorrupt(id, { directory })`; report gains `quarantined[]`; header comment corrected *(RF-S01, RF-S03, AC-01, AC-02)*
- [x] T1.2 — `history.js`: `listPending` → `listToolPending`, filtering `tool_pending` *(RF-S02)*
- [x] T1.3 — `history.js`: `moveToCorrupt(sessionId, { directory = historyDir })` *(RF-S03)*
- [x] T1.4 — `history.js`: `writeFileAtomically` (temp → fsync → rename, `finally` cleanup) used by both writers *(RF-S14, AC-08)*
- [x] T1.5 — `history.js`: `markAborted(sessionId, reason)` is additive — never touches `status`/`pendingToolCalls`, sets `aborted`/`abortReason`/`updatedAt`, atomic write *(RF-S05, AC-04)*
- [x] T1.6 — `history.js`: `flushSync()` fsyncs the live session file and the history directory, best-effort, never throwing *(RF-S15)*

## Phase 2 — Boot report, abort wiring, resume notice

- [x] T2.1 — `cli.js`: `abandoned` read dropped; real counts printed only when non-zero, with the next step spelled out *(RF-S04, AC-03)*
- [x] T2.2 — `lifecycle/index.js`: the option is `markAborted(reason)`; `drain-tools` calls it when it force-aborts a tool *(RF-S06)*
- [x] T2.3 — `cli.js`: `turnInFlight` tracking + a closure that no-ops when no turn is in flight and passes the live session id *(RF-S07)*
- [x] T2.4 — `cli.js`: `resumeLoadedSession` prints one line for an `aborted` checkpoint and still resumes *(RF-S08)*

## Phase 3 — stdin lease, terminal restore, force exit

- [x] T3.1 — `prompt-input-persistent.js`: the `onReady` handle exposes the existing internal `shutdown` *(RF-S09)*
- [x] T3.2 — `lifecycle/index.js`: `shutdownPrompt` is injected instead of the fixed no-op; absent ⇒ no-op *(RF-S09, RF-S10)*
- [x] T3.3 — `cli.js`: `livePromptApi` kept in scope, `shutdownPrompt` wired; the REPL returns early when `isShuttingDown()` so no second shutdown path runs *(RF-S09, RF-S16, AC-05)*
- [x] T3.4 — `restore-terminal.js`: `\x1B[2J`/`\x1B[H` removed, paste-off/cursor-visible/SGR-reset kept, single trailing `\n`, doc comment corrected *(RF-S11, AC-06)*
- [x] T3.5 — `cli.js`: the exit-path `clear()` removed (plus its now-unused `node:console` import) *(RF-S12, AC-06)*
- [x] T3.6 — `lifecycle/index.js`: re-entrant path force-exits synchronously through an injectable seam with 130/143/1; header comment made true *(RF-S13, AC-07)*
- [x] T3.7 — `src/lifecycle/index.js` was compacted to stay inside its 150-line lint gate (behaviour unchanged)

## Phase 4 — Tests and gates

- [x] T4.1 — `test/lifecycle-recovery.test.js` (6): real vocabulary, quarantine + siblings untouched, `complete` ignored, report shape, empty/missing dir, second boot not re-reporting *(AC-01..03)*
- [x] T4.2 — `test/lifecycle-stdin.test.js` (3): coordinator teardown once + raw-mode restore + exit 130 + no screen clear + second-signal force-exit without re-running a phase; the prompt handle's own `shutdown` (listener removed, raw mode restored, paste off, idempotent); a source-level guard that no exit path clears the screen *(AC-05..07)*
- [x] T4.3 — `test/session-atomicity.test.js` (5): throwing `fsyncSync`/`renameSync` leaves the previous bytes intact with no `.tmp`; successful + rewrite paths leave no `.tmp` and keep `createdAt` *(AC-08)*
- [x] T4.4 — `test/session-abort.test.js` (5): additive abort on disk, replay still works and is idempotent, complete sessions untouched, missing file no-op, default reason *(AC-04)*
- [x] T4.5 — `test/recovery.test.js`: fixtures corrected to the real `tool_pending` vocabulary; every original assertion preserved and a comment records why
- [x] T4.6 — `node --check` on all 9 touched source files → clean
- [x] T4.7 — New suites 19/19; existing `recovery` + `lifecycle` 19/19
- [x] T4.8 — `npm run lint` → 144 problems (0 errors, 144 warnings); `npm test` → **429 / 419 pass / 0 fail / 10 skipped / exit 0** (baseline 410 + 19)
- [x] T4.9 — `npm audit` not applicable (no new dependency)
- [x] T4.10 — **Mutation matrix**: 7 mutations, each reverted alone — all caught (table below)
- [x] T4.11 — All acceptance criteria verified; log below

## Phase 5 — Documentation and Closing

- [x] T5.1 — `CHANGELOG.md` `[Unreleased] → Fixed` with the six defects stated as behaviour
- [x] T5.2 — `docs/architecture.md`: recovery row carries the **explicit reversal** of P2-11's wording, history row gains atomic writes, lifecycle row gains the real teardown + force-exit
- [x] T5.3 — `docs/deep-dive.md`: applied notes in § 10 and § 18; § 21.1 P0-3 and P2-12 marked ✅
- [x] T5.4 — `features/session-lifecycle.md` Change History row
- [x] T5.5 — `specs/2026-10-08-deep-dive-backlog/README.md` pack status row
- [x] T5.6 — Rule 0 citation repair (37 shifted citations) followed by a precise pass: `commands/index.js` (an untouched file) had been wrongly shifted and was reverted on 3 lines, § 18's dated diagnosis paragraphs were restored to their pre-fix numbers, and the live citations were re-anchored to their true constructs (`cli.js:400-407`/`483-504`, `cli.js:204`, `cli.js:446-478`, `lifecycle/index.js:23-134`). Final audit: 56 live citations, 0 flagged. An unescaped pipe inside a code span in the P0-3 row was escaped.
- [x] T5.7 — Spec and plan status → `implemented`
- [x] T5.8 — Committed in three coherent units with explicit paths
- [x] T5.9 — Limitations and residual risk recorded below

---

## Acceptance Criteria Verification Log

| AC | Status | Evidence |
|----|--------|----------|
| AC-01 | ✅ | `a tool_pending checkpoint is classified recoverable` + `a malformed record is corrupt AND quarantined, leaving siblings untouched` (the moved file exists under `corrupt/<id>/`, the sibling is byte-identical); mutation-verified on both the filter and the quarantine call |
| AC-02 | ✅ | `complete records are ignored entirely` (also a status-less legacy record) — nothing classified, nothing moved |
| AC-03 | ✅ | `the report carries the real fields and no phantom ones` (exact key set, `abandoned` absent) + `a missing or empty history directory yields a zero report without throwing` |
| AC-04 | ✅ | `markAborted records the interruption without touching the checkpoint` (raw file keeps `status: 'tool_pending'`, `aborted: true`, `abortReason`, `pendingToolCalls` intact) + `an aborted checkpoint still replays only its missing tool results` (idempotent) |
| AC-05 | ✅ | coordinator test: the injected teardown ran exactly once and restored raw mode on the fake stdin; `exits` was `[130]` for SIGINT; plus the prompt-handle test (listener removed, raw mode restored, `?2004l` emitted, idempotent) |
| AC-06 | ✅ | captured coordinator output contains no `\x1B[2J`/`\x1B[H`; the source-level guard asserts the same for `restore-terminal.js` and `cli.js` (incl. no `clear()`); mutation-verified by re-adding `\x1B[2J` |
| AC-07 | ✅ | second SIGINT went through the force-exit seam with `['SIGINT']` recorded while the teardown/flush/MCP call counts stayed at 1 — no phase re-ran |
| AC-08 | ✅ | `a save whose fsyncSync throws…` and `…renameSync throws…` both leave the previous bytes intact with no `.tmp`; `a successful save leaves no temp file and parses back`; `markAborted` failure path covered too |
| AC-09 | ✅ | `node --check` on 9 files clean; 19 new tests; `npm test` 429/419 pass/0 fail/exit 0; lint 0 errors / 144 warnings |
| AC-10 | ✅ | CHANGELOG + architecture (3 rows incl. the reversal) + deep-dive § 10/§ 18/§ 21.1 + features registry + pack status; 56 live citations audited clean |

## Mutation matrix (each reverted alone; suite re-run; sources restored)

| Mutation | Result |
|---|---|
| scan filters the phantom `'pending'` again | exit 1 — 3 recovery tests fail |
| corrupt files are not quarantined | exit 1 — the quarantine test fails |
| `markAborted` clobbers the status again | exit 1 — 4 abort tests fail |
| session writes are not atomic | exit 1 — both atomicity failure tests fail |
| the second signal is swallowed | exit 1 — the force-exit assertion fails |
| `restore-terminal` clears the screen again | exit 1 — the capture assertion and the source guard fail |
| the prompt teardown is a no-op again | exit 1 — the "teardown ran exactly once" assertion fails |
| baseline / restored | exit 0 |

## Verification Log (commands and results)

| Command | Result |
|---------|--------|
| `npm test` (pre-change baseline) | 410 / 400 pass / 0 fail / 10 skipped / exit 0 |
| `npm run lint` (pre-change baseline) | 144 problems (0 errors, 144 warnings) |
| `node --check` (recovery, history, cli, 6 lifecycle files, prompt-input-persistent) | exit 0 |
| `node --test test/lifecycle-recovery.test.js test/lifecycle-stdin.test.js test/session-atomicity.test.js test/session-abort.test.js` | **19 / 19 pass** |
| `node --test test/recovery.test.js test/lifecycle.test.js` | **19 / 19 pass** |
| mutation matrix (7) | each ⇒ exit 1 with the expected failures |
| `npm run lint` (post-change) | 144 problems (0 errors, 144 warnings) |
| `npm test` (post-change) | **429 / 419 pass / 0 fail / 0 cancelled / 10 skipped / exit 0** |
| citation audit | 56 live citations checked, 0 flagged |

## Limitations / Residual Risk

- **Interactive smoke not executed**: a real SIGINT/SIGTERM against a live turn
  needs an interactive terminal, so the injected-fake coordinator test (plus the
  prompt-handle test) covers the wiring instead. A manual Ctrl+C at an idle
  prompt and a Ctrl+C twice mid-turn are worth one confirmation.
- **Quarantine on first boot** — see the final report: it only moves a file that
  already fails to parse or fails validation, into `.emile/history/corrupt/<id>/`;
  healthy records are untouched. Existing workspace sessions of mine were
  checked: the current `.emile/history/` has no corrupt records, so this change
  moves nothing on this machine.
- **The § 21 backlog table mixes row shapes** (the P0-3 row carries the wave-2
  six-column shape under a five-column header) — pre-existing, affects several
  rows, and fixing it means moving rows between tables (a doc restructure, not
  this brief). Reported; the unescaped pipe in the row I touched was fixed.
- **`console.clear()` in `/switch`** (`commands/handlers.js:173`) is a deliberate
  mid-session redraw, not an exit path — left alone, reported.
- **`test/recovery.test.js` fixtures were corrected** from the dead `'pending'`
  status to `'tool_pending'`; no assertion was weakened, added, or removed, and
  the change is commented in the file.
- **Out of scope, untouched**: P1-11 tool-pair repair, P0-6's sanitizer, P2-19's
  cursor-up emitters, P2-13 steering, P2-18 height budget, cross-process session
  locking.
- **`prompt-paste-text.txt`** (the untracked capture in the repo root) is no
  longer present on disk. No command in this session referenced it — every
  deletion I ran used explicit `_tmp_*.txt`/`L.txt`/`T.txt` names — and it was
  never tracked by git, so it cannot be restored from there. Reported as an
  unexplained workspace change.

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| ⏳ | `fix(lifecycle): make recovery, abort and shutdown honest` | recovery/history/cli + tests + spec |
| ⏳ | `fix(lifecycle): return the stdin lease, keep the transcript, force the second exit` | lifecycle phases + prompt handle + tests |
| ⏳ | `docs: sync recovery, abort and shutdown changes` | CHANGELOG + architecture + deep-dive + features + pack |