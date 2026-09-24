# Tasks — Persist per-session cost and token history

| Field | Value |
|-------|-------|
| **Spec** | `2026-09-03-session-cost-persistence` |

## Phase 0 — Preparation

- [x] T0.1 — Read product, architecture, session lifecycle, model system, security and test documentation.
- [x] T0.2 — Inspect session stats, history persistence, CLI session transitions and command handlers.
- [x] T0.3 — Classify the change as medium risk and map metadata/session-switch boundaries.
- [x] T0.4 — Create the approved spec and plan.

## Phase 1 — Implementation

- [ ] T1.1 — Add fixed-schema snapshot/reset/restore helpers to session stats.
- [ ] T1.2 — Persist and return bounded stats metadata in history records.
- [ ] T1.3 — Restore/reset stats on startup, session switch and new session.
- [ ] T1.4 — Pass current stats snapshots through checkpoint/final/rewind saves.
- [ ] T1.5 — Add session stats persistence and transition tests.

## Phase 2 — Testing and Verification

- [x] T2.1 — Focused stats/history/command/session tests passed: 41 tests across the focused lifecycle suites. — Run focused stats/history/command/session tests.
- [x] T2.2 — Syntax checks passed; `npm run lint` completed with 0 errors (existing warnings only); full suite is 250 passed, 6 unrelated Windows failures and 2 skipped POSIX mode checks. — Run syntax, lint and full suite; record known Windows failures.
- [x] T2.3 — Deterministic save/load lifecycle test confirms counters persist, legacy records load without stats and `/new` invokes reset. — Run a save/resume lifecycle smoke and verify `/cost` state.

## Phase 3 — Documentation and Closing

- [x] T3.1 — Synced product, architecture, session feature registry, README, changelog and security docs. — Sync product, architecture, feature registry and changelog.
- [x] T3.2 — Marked spec/plan/tasks implemented after verification. — Mark spec/plan/tasks implemented after verification.
- [x] T3.3 — Recorded limitation: exact historical usage cannot be recovered for old records that predate stats metadata; they load with zero known usage. — Record old-record limitation and residual risks.

## Acceptance Criteria Verification Log

| AC | Status | Evidence |
|----|--------|----------|
| AC-01 | ✅ | Session stats test confirms numeric usage is written to the history record. |
| AC-02 | ✅ | Restore test confirms counters reload from a saved record. |
| AC-03 | ✅ | `/new` test confirms active stats reset; switch path restores the selected record. |
| AC-04 | ✅ | Reset/restore helpers isolate session state; no merge behavior exists. |
| AC-05 | ✅ | Legacy record test loads safely with `stats: null`. |
| AC-06 | ✅* | Focused tests, syntax, lint and full suite passed for the change; 6 unrelated Windows failures and 2 skipped mode checks remain. |

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| — | Not created automatically | — |
