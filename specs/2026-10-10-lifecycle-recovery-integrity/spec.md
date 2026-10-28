# Spec: Recovery, abort and shutdown integrity

| Field | Value |
|-------|-------|
| **ID** | `2026-10-10-lifecycle-recovery-integrity` |
| **Status** | `implemented` |
| **Phase/Context** | Persistence + lifecycle — deep-dive backlog item **P0-3** (§ 10 recovery vocabulary, § 18 shutdown phases), with **P2-12** (atomic session writes) folded in |
| **Related documents** | [Brief P0-3](../2026-10-08-deep-dive-backlog/briefs/p0-3-lifecycle-recovery-shutdown.md), [Shared constraints](../2026-10-08-deep-dive-backlog/_shared-constraints.md), [deep-dive § 10 / § 18 / § 21.1](../../docs/deep-dive.md), [Code Quality and Security](../../docs/code-quality-and-security.md), [ADR-0001](../../docs/adr/0001-tech-stack-choice.md), [feature: session-lifecycle](../../features/session-lifecycle.md) |

---

## 1. Problem / Motivation

Six independent defects share one surface — the boundary where emile crashes,
aborts, or exits — and each of them makes that boundary lie to the user.

1. **The recovery scan has never fired.** `src/recovery.js:95` skips any record
   whose `status !== 'pending'`, and `history.js:316` (`listPending`) filters the
   same string. No writer produces `'pending'`: `saveSession` (`history.js:120`)
   persists only `'tool_pending'` or `'complete'`. So the feature that exists to
   surface a crash that happened mid-tool always reports **0 recoverable / 0
   corrupt** (F1–F3).
2. **Corrupt sessions are never quarantined.** `moveToCorrupt()`
   (`history.js:297`) has **zero callers**, so a torn JSON file is re-read and
   re-reported on every boot, forever (F4).
3. **The boot report is partly fictional.** `cli.js:157` reads
   `recoveryReport.abandoned`, a field the report has never had — the classifier
   is two-way (`recoverable | corrupt`) (F5).
4. **`markAborted` is dead, and would be destructive if wired naively.** No phase
   calls it (F6), `cli.js:172` drops the `reason`, and its body overwrites
   `status: 'aborted'` — which would erase `tool_pending` **and**
   `pendingToolCalls`, destroying exactly the resumability the recovery path
   exists to preserve.
5. **Idle SIGINT leaves the terminal broken.** `stop-input.js:23` calls
   `shutdownPrompt?.()`, but `lifecycle/index.js:55-58` injects an explicit
   **no-op**, so the persistent prompt is never torn down: its keypress listener
   stays attached and raw mode is never restored (F7).
6. **Every exit destroys the transcript** (`restore-terminal.js:24-25` writes
   `\x1B[2J` + `\x1B[H`), **the second Ctrl+C does not force anything** (the
   header promises an exit that `guard()` never performs — F9), and **session
   writes are not atomic**: `history.js:149` and `:287` write the whole file with
   a bare `fs.writeFileSync`, and `flushSync()` is a documented no-op (F10). A
   crash mid-write truncates the JSON — which the scanner then classifies as
   corrupt, i.e. the persistence layer manufactures the data loss the recovery
   layer is supposed to repair.

## 2. Goal

The shutdown/recovery surface tells the truth: the boot scan finds real
`tool_pending` checkpoints and quarantines corrupt files, an aborted turn is
recorded **without** losing resumability, idle SIGINT releases the stdin lease
and restores the terminal, exit keeps the transcript on screen, a second signal
really forces the exit, and session writes are atomic so a crash cannot truncate
the file.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-------------|---------------------|
| RF-S01 | `runStartupRecovery` selects records with `status === 'tool_pending'` (the only mid-tool status any writer produces). | Must |
| RF-S02 | `history.js` exposes `listToolPending()` (renamed from the dead `listPending`) filtering `tool_pending`, so no caller can filter a status nobody writes. | Must |
| RF-S03 | The scanner's corrupt branch quarantines the file via `moveToCorrupt()` — its first caller — and reports the quarantine. The scan remains **read-only in every other respect**: no tool is executed, no record is rewritten. | Must |
| RF-S04 | The boot report is honest: no `abandoned` field is read; `recoverable`/`corrupt` counts are printed with an actionable next step; a zero-item report prints nothing. | Must |
| RF-S05 | `markAborted(sessionId, reason)` never changes `status` and never drops `pendingToolCalls`; it adds `aborted: true` and `abortReason`. A `tool_pending` record stays resumable. | Must |
| RF-S06 | The abort `reason` is plumbed end to end (coordinator → closure → record). | Must |
| RF-S07 | The shutdown path marks the **live** session aborted only when a turn is in flight; otherwise it no-ops. | Must |
| RF-S08 | `resumeLoadedSession` treats `aborted && tool_pending` explicitly: the session is still resumable, with a one-line notice that the turn was interrupted. | Must |
| RF-S09 | `installShutdownHandlers` accepts an optional `shutdownPrompt` and registers it instead of the no-op; the live prompt exposes its existing teardown via the `onReady` handle (no reimplementation). | Must |
| RF-S10 | Calling the prompt teardown before the prompt exists is safe (no-op). | Must |
| RF-S11 | `restore-terminal` keeps bracketed-paste off, the cursor visible and SGR reset, and **never clears the screen or homes the cursor**; it ends with a single newline so the shell prompt cannot collide with the last line. | Must |
| RF-S12 | The normal REPL exit path does not clear the screen either (same defect, same exit path). | Must |
| RF-S13 | A second signal during shutdown forces the exit **synchronously** with the same code the coordinator would use (SIGINT → 130, SIGTERM → 143, otherwise 1), without running any phase. | Must |
| RF-S14 | `saveSession` and `markAborted` write atomically (temp file → `fsync` → `rename`), leaving the previous file byte-intact on failure and no `.tmp` behind. | Must |
| RF-S15 | `flushSync()` becomes a real durability step (fsync of the live session file and of the history directory) instead of a documented no-op — the phase keeps meaning. | Must |
| RF-S16 | No phase calls `process.exit`; the coordinator alone owns the exit. | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|----------|
| **Risk classification** | **High** per [Code Quality and Security § 2](../../docs/code-quality-and-security.md): the change touches process exit, signal handling, terminal mode, and the on-disk session format. A mistake can leave a terminal unusable, kill a session's data, or publish a partially written record. High risk requires the failure/rollback analysis below and the negative criteria. |
| **Assets/secrets** | Session transcripts in `.emile/history/<id>.json` (the user's work) and the terminal's usable state. Nothing is newly written outside `.emile/history/`; the quarantine move stays inside it. |
| **Command execution / file writes** | The scanner **must not execute tools** — it only parses JSON, validates paths through `resolveSafePath` (read-only) and may move one file. Session writes gain a temp file + rename inside the same directory; `resolveSafePath`/whitelist/dry-run are untouched. |
| **Untrusted inputs** | Session JSON is attacker-influenceable (the model writes message content into it). It is parsed defensively: parse errors are quarantined, never executed; `classify` validates tool-call shape and re-runs every file path through `resolveSafePath`. |
| **Negative criteria** | Must NOT: execute a tool at boot; let `markAborted` clobber `status: 'tool_pending'` or drop `pendingToolCalls`; reimplement the prompt teardown; clear the screen on exit in any phase or on the normal exit path; call `process.exit` from inside a phase; delete or rewrite any other session file during the scan; leave a `.tmp` file behind on a failed write; add a dependency. |

### 4.1 Failure and rollback analysis (High risk)

| Failure mode | Blast radius | Containment |
|---|---|---|
| Atomic write fails midway on the live session | The session file could be truncated | Temp file is written and `fsync`ed **before** any rename, so the previous file is only replaced on success; the `finally` unlinks the temp. Test asserts the old bytes survive a spurious throw. |
| Quarantine move fails (locked file, permissions) | A corrupt file stays in place | `moveToCorrupt` is best-effort and swallows errors; the report still counts the corruption. |
| `shutdownPrompt` throws | Shutdown would stall | Phase 1 wraps it in `try/catch`; the coordinator also catches per-phase errors and continues. |
| Second signal arrives mid-phase | The user is stuck waiting up to the 3 s cap | The re-entrant path calls `process.exit` immediately with the same code. |
| Terminal left in raw mode / paste mode | Unusable shell | Phase 1 now runs the prompt's real teardown (restores raw mode + `?2004l`) and the process-level `exit` handler still resets ANSI; screen content is never cleared. |
| `markAborted` on a non-pending record | Harmless extra fields | Only additive fields are written; `status` is never changed. |
| Rollback | — | Revert the commits: no migration was performed, no file format changed (only *when* fields are written), and quarantined files are moved, never deleted, so a revert leaves them recoverable under `.emile/history/corrupt/`. |

## 5. Out of Scope

Reported, not fixed (Rule 6.2):

- **Tool-pair repair after compression** — brief **P1-11**; do not duplicate P0-6's read-time sanitizer either.
- **The remaining uncapped cursor-up emitters** (`turn-keys.js:78,91`, `model-picker.js:145`, `prompt-input.js:192,234,242,365`) — **P2-19**.
- **Mid-turn steering** — **P2-13**. **Prompt block height budget** — **P2-18**.
- **Session registry / cross-process locking** — a later item, not briefed.
- **`console.clear()` in `/switch`** (`commands/handlers.js:173`) — a deliberate mid-session redraw, not an exit path; noted, not changed.

## 6. Acceptance Criteria

- **AC-01:** Given a `tool_pending` record on disk, when the boot scan runs, then it is classified `recoverable`; given a malformed one, then it is `corrupt` **and** moved under `.emile/history/corrupt/` while every other file is untouched.
- **AC-02:** Given a `complete` record, when the scan runs, then it is ignored (not classified, not moved).
- **AC-03:** The report has no `abandoned` field, and a scan of an empty/missing directory returns a zero report without throwing.
- **AC-04:** Given SIGTERM while a tool is in flight, when the coordinator runs, then the live session record has `status: 'tool_pending'` + `aborted: true` + its original `pendingToolCalls`, and `resumePendingTools` still replays it.
- **AC-05:** Given an idle prompt and SIGINT, when phase 1 runs, then the injected prompt teardown executes exactly once (listener removed, raw mode restored, bracketed paste disabled) and the process exits with code 130.
- **AC-06:** No exit path emits `\x1B[2J` or `\x1B[H`: not the `restore-terminal` phase and not the normal REPL exit.
- **AC-07:** Given a second signal while shutdown is running, then the exit is forced synchronously with the same code and no phase runs a second time.
- **AC-08:** Given `fsyncSync`/`renameSync` throwing during a save, then the previous file is byte-identical afterwards and no `.tmp` remains; given a successful save, then no `.tmp` remains and the JSON parses.
- **AC-09:** `node --check` clean on every touched file; the full suite exits 0; `npm run lint` reports 0 errors.
- **AC-10:** Rule 2 docs sync, including the explicit **reversal** of the `architecture.md` recovery row (P2-11 had documented the scan as read-only and never moving sessions) and `§ 21.1` P0-3 + P2-12 marked applied.

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|---------|--------------------|
| Quarantining on first boot moves a file the user might have wanted to inspect in place. | The file leaves `.emile/history/`. | It is **moved, never deleted**, into `.emile/history/corrupt/<sessionId>/<ts>.json`, the same place `moveToCorrupt` was designed for; the boot report names the quarantine. § 3 of the final report states the exact on-disk effect. |
| Calling the prompt's teardown resolves the REPL's pending promise, so the code after the `await` would print "Goodbye", clear the screen and close MCP while the coordinator is still running phases. | Double shutdown / screen wipe / interleaved output. | The post-`await` path checks `isShuttingDown()` and returns without touching the screen or MCP; the coordinator owns the exit (RF-S12, AC-06). |
| `markAborted` writes during shutdown. | A partially written file at exit. | It uses the same atomic helper (RF-S14), and `flushSync` fsyncs afterwards. |
| The scan quarantines a directory (a fixture, or an odd filesystem state) rather than a file. | A directory moves. | Accepted: it is a genuinely corrupt entry; `renameSync` handles it and the report counts it. |
| Two signals arriving in the same tick. | The coordinator could run twice. | The `_ReEntrant` latch is set synchronously before any `await`, so the second call always takes the force-exit path. |

## 8. References

- `src/recovery.js` — scan, classifier, quarantine.
- `src/history.js` — `saveSession`, `markAborted`, `moveToCorrupt`, `listToolPending`, `flushSync`, `getSessionRecord`.
- `src/lifecycle/{index,stop-input,drain-tools,flush-session,restore-terminal}.js` — the ordered phases.
- `src/cli.js` — boot report, coordinator wiring, `resumeLoadedSession`, REPL exit path.
- `src/ui/prompt-input-persistent.js` — the `onReady` handle and its internal `shutdown()`.
- `src/memory/io.js:20-42` — the repo's canonical atomic-write pattern this change adopts.
- `test/recovery.test.js`, `test/lifecycle.test.js` — existing suites whose fixtures/assertions must keep passing.