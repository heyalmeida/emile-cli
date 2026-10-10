# BRIEF P0-3 — Lifecycle & recovery integrity: make the boot scan fire, the abort land, the exit honest

> Read first: `specs/2026-10-08-deep-dive-backlog/_shared-constraints.md` and
> `docs/deep-dive.md` § 10, § 18 (full findings).
>
> **Status note (2026-10-10):** all line numbers below were re-verified against
> the current tree. P0-6 already added read-time history sanitization
> (`history.js:42 isValidAssistantMessage`, filter at `:186`) — do NOT duplicate
> it; tool-pair repair after compression is P1-11. This brief also folds in
> backlog **P2-12** (atomic session writes) because it is the same durability
> surface and the same files.

## Goal

Seven verified defects, all on the shutdown/recovery surface:

1. **The boot scanner never fires.** `runStartupRecovery()` skips anything whose
   `status !== 'pending'` (`src/recovery.js:95`) and `listPending()` filters
   `'pending'` (`src/history.js:316`) — but `saveSession()` only ever persists
   `tool_pending` or `complete` (`history.js:120`). The scan reports 0/0 forever
   and a crash mid-tool is never surfaced at boot.
2. **`moveToCorrupt()` is dead code** (`history.js:297`, zero callers), so a
   state we classify as corrupt is never quarantined and is re-listed on every
   boot.
3. **`cli.js:157` reads `recoveryReport.abandoned`** — a field the report does
   not have (`recovery.js` classifies two-way: `recoverable | corrupt`).
4. **`markAborted` is orphaned**: declared in `history.js:279`, wired into the
   coordinator (`cli.js:172`, which even DROPS the `reason` argument), typed in
   `drain-tools.js:9,17` and `lifecycle/index.js:16,51,53` — and never called by
   any phase. Meanwhile a SIGTERM mid-tool leaves a plain `tool_pending` record
   indistinguishable from a crash.
5. **The stdin lease is never returned on idle SIGINT**: `stop-input.js:23`
   calls the injected `shutdownPrompt?.()`, but `lifecycle/index.js:55-58`
   injects an explicit no-op (`// This hook is a no-op here.`). `restore-terminal`
   assumes the prompt already restored raw mode ("already handled by
   prompt-input-persistent.js shutdown()") — which never ran.
6. **Every exit wipes the user's screen**: `restore-terminal.js:24-25` writes
   `\x1B[2J` (clear) + `\x1B[H` (home), destroying the transcript the user was
   reading.
7. **The second signal is swallowed**: the file header promises "a second signal
   sets the exit code and calls process.exit once", but `guard()`
   (`lifecycle/index.js:39-43`) makes the second `coordinator()` return early —
   nothing forces the exit.

Folded **P2-12**: `saveSession`/`updateSession` write the whole file with a bare
`fs.writeFileSync` (`history.js:149, 287`) — no temp, no fsync, no rename — and
`flushSync()` (`history.js:269-273`) is a documented no-op. A crash or a
forced exit mid-write truncates the JSON, which the scanner then classifies as
corrupt: the exact data the recovery path exists to save.

## Required design (do not re-derive; implement this)

1. **Vocabulary fix**: `recovery.js:95` filters `tool_pending`; `listPending()`
   (`history.js:316`) filters `tool_pending` (rename it `listToolPending` if you
   prefer — it has no callers today, so the rename is free).
2. **Quarantine for real**: the scanner's corrupt branch calls `moveToCorrupt()`
   (keep the function, give it its first caller). This CHANGES what
   `docs/architecture.md` says (P2-11 documented the scan as strictly read-only —
   see Docs sync).
3. **Report honesty**: drop the `recoveryReport.abandoned` read; print the real
   counts with actionable text (`1 recoverable session — run /switch or resume on
   next boot`).
4. **`markAborted` lands, resumability preserved**: `history.js:279` must NOT
   clobber `status: 'tool_pending'`; it adds `aborted: true` +
   `abortReason: <string>` and KEEPS `pendingToolCalls`. Wire it from the
   shutdown coordinator with the live session id (a closure in `cli.js` that
   no-ops when there is no in-flight turn) and plumb the `reason` through
   (`cli.js:172` currently drops it). `resumeLoadedSession` (`cli.js:252-287`)
   must treat `aborted && tool_pending` explicitly: resumable, with a one-line
   notice that the turn was interrupted.
5. **Real prompt teardown on idle SIGINT**: `installShutdownHandlers` accepts an
   optional `shutdownPrompt` and registers THAT instead of the no-op
   (`index.js:55-58`). `cli.js` passes a function that invokes the live
   persistent prompt's teardown — expose it by adding `shutdown()` to the
   existing `onReady` handle (`persistentPromptInput`, alongside `redraw` /
   `setInput`); it must remove the keypress listener, restore `wasRaw`, write
   `\x1B[?2004l`, and resolve the pending promise (i.e. the same path its own
   Ctrl+C already takes). Early calls (prompt not created yet) must be safe.
6. **Stop wiping the screen**: `restore-terminal.js` keeps bracketed-paste off,
   cursor visible and SGR reset, drops `\x1B[2J` + `\x1B[H`, and ends with ONE
   newline so the shell prompt does not collide with the last line.
7. **Second signal forces the exit**: `guard()`'s re-entrant path exits with the
   same code the coordinator would use (sync only, no phase work) — make the
   header's promise true.
8. **Atomic session writes (P2-12)**: adopt the repo's existing pattern
   (`plans.js:142` tmp+rename; `memory/io.js` tmp+fsync+rename) for BOTH
   `history.js:149` and `:287`. `flushSync()` becomes a real fsync of the live
   session file (or is removed from the phase contract — pick one and document
   it in the spec).

## Tests to add

- `test/lifecycle-recovery.test.js` (temp `.emile/history/`):
  (a) `tool_pending` record → classified `recoverable`; (b) malformed JSON →
  `corrupt` AND moved under `.emile/history/corrupt/` (assert the move);
  (c) `complete` record → ignored; (d) the `RecoveryReport` has no `abandoned`
  field and the boot path does not throw with 0 items.
- `test/lifecycle-stdin.test.js`: call the coordinator directly with injected
  fakes — assert the injected `shutdownPrompt` is invoked once, that raw-mode
  restore was attempted, and that a SECOND signal reaches the force-exit path
  (inject an `exit` seam or spy `process.exit`).
- `test/session-atomicity.test.js`: with `fsyncSync`/`renameSync` spied to throw,
  a failing save leaves the PREVIOUS file intact; a successful save leaves no
  `.tmp` behind and the JSON parses.
- `test/session-abort.test.js`: after `markAborted`, `status === 'tool_pending'`,
  `aborted === true`, `pendingToolCalls` preserved, and `resumePendingTools`
  still replays only the missing results.

## Constraints

- Recovery never executes tools at boot; the ONLY write it performs is the
  quarantine move (item 2).
- Lifecycle phases never throw (existing catch + verbose-log pattern).
- Do not duplicate P0-6's load-time `isValidAssistantMessage` filter; do not
  touch P1-11's territory (tool-pair repair after compression).
- `test/run-command.test.js` and the UI suites must stay green.
- No new dependencies.

## Verification

```
node --check src/recovery.js src/history.js src/cli.js src/lifecycle/*.js
node --test test/lifecycle-recovery.test.js test/lifecycle-stdin.test.js test/session-atomicity.test.js test/session-abort.test.js
npm run lint && npm test
```
Baseline (2026-10-10): 410 tests / 400 pass / 0 fail / 10 env skips; lint exit 0.

## Docs sync (Rule 2)

- CHANGELOG `[Unreleased]` → Fixed: the boot recovery scan now matches
  `tool_pending` checkpoints and quarantines corrupt files; an aborted turn is
  recorded without destroying resumability; idle SIGINT returns the stdin lease;
  exit no longer clears the screen; session writes are atomic; the second signal
  forces the exit.
- `docs/architecture.md`: recovery.js row (scan now moves corrupt files — this
  REVERSES P2-11's "read-only" wording, say so), history.js row (atomic write),
  lifecycle row (real prompt teardown + force-exit).
- `docs/deep-dive.md` § 10 and § 18: mark applied; § 21.1 P0-3 and P2-12 rows ✅
  (P2-12 folded here).
- `features/session-lifecycle.md`: Change History row.