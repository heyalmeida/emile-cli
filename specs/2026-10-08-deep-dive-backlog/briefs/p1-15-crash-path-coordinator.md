# BRIEF P1-15 — Crash paths: route uncaught errors through the shutdown coordinator

> Read first: `specs/2026-10-08-deep-dive-backlog/_shared-constraints.md` and
> `docs/deep-dive.md` § 18 (lifecycle), § 10 (persistence). Complements P0-3
> (landed: real prompt teardown, force-exit on the second signal, atomic writes,
> honest recovery report).

## Goal

Two verified gaps on the crash path:

1. **No crash hooks at all.** `src/` and `bin/` register SIGINT/SIGTERM/SIGHUP
   and `process.on('exit')` (`src/lifecycle/index.js`), but there is NO
   `uncaughtException` and NO `unhandledRejection` handler (grep-verified
   2026-10-10). An async throw outside the agent's own try/catch therefore kills
   the process through Node's default handler: the 6-phase coordinator never
   runs, so the session is not flushed to `complete`, global memory is not
   flushed, MCP children are NOT shut down (orphaned processes) and the terminal
   is only minimally restored by the `exit` hook. The per-tool checkpoints mean
   the turn is mostly on disk, and P0-3's scanner will now report the session as
   recoverable — but the crash is silent and the shutdown contract is bypassed.
2. **The fatal path destroys the evidence.** `bin/emile.js:8-12`:
   `main().catch(err => { console.clear(); console.error('Fatal error…', err); process.exit(1); })`
   — `console.clear()` wipes the scrollback (the session the user was reading)
   BEFORE printing the error, and `process.exit(1)` bypasses the coordinator.
   The same `console.clear()` pattern in `commands/handlers.js:173` is a
   deliberate mid-session redraw (`/switch`) — leave it, it is not an exit path.

## Required design (do not re-derive; implement this)

1. **Register crash hooks in the lifecycle layer** (not in `bin/`): export
   `installCrashHandlers({ onFatal })` from `src/lifecycle/index.js` (or a new
   `src/lifecycle/crash.js` to stay inside the 150-line lint gate — the file is
   at 140 lines today):
   - `process.on('uncaughtException', (err) => coordinator('uncaughtException'))`
     and the same for `unhandledRejection` — reuse the EXISTING coordinator so
     every phase (flush-session, flush-memory, shutdown-mcp, restore-terminal)
     runs exactly once; the re-entrancy guard already makes a second call safe.
   - Exit code 1 for both; the reason string must reach the report so the user
     can tell a crash from a Ctrl+C.
2. **Print the error BEFORE/while shutting down, never after a clear**: write a
   one-line dim `✗ Fatal: <message>` to **stderr** (so pipes keep it), then run
   the coordinator. The message must be redacted with the same discipline as
   `formatApiError` (`src/api/client.js:153-159`): strip `Bearer …`, `key=value`
   secret shapes and control characters, cap the length. Do NOT print raw error
   objects (they can carry request bodies with the user's content) — message
   only, plus `err.code`/`err.status` when present.
3. **Do not clear the screen**: remove `console.clear()` from `bin/emile.js`;
   keep `console.error` and let `restore-terminal` (P0-3) handle the terminal.
   Route the catch through the coordinator: `main().catch(err => onFatal(err))`.
4. **Crash-loop safety**: the fatal handler must never throw (wrap in
   try/catch), must be idempotent (second crash while shutting down → immediate
   `exit(1)`), and must not await anything unbounded (the coordinator's own
   per-phase slices already bound the total).
5. **Do not swallow**: an `uncaughtException` still ends the process (exiting is
   the safe default for an unknown state) — this is not "keep running".

## Tests to add (new file `test/lifecycle-crash.test.js`)

- Inject the crash hooks with a fake `onFatal`/coordinator seam: an
  `uncaughtException` emit runs every phase exactly once and exits 1 (spy the
  exit seam P0-3 added).
- An `unhandledRejection` emit behaves identically.
- The rendered fatal line is redacted: a fake error carrying
  `Authorization: Bearer supersecret` and `api_key=tok123` prints neither.
- A throw INSIDE the fatal handler does not escape (process still exits 1).
- `bin/emile.js` no longer contains `console.clear` (source assertion) and
  `commands/handlers.js:173` still does (documented as intentional).
- Regression: the P0-3 suites (`lifecycle-stdin`, `lifecycle-recovery`,
  `session-atomicity`, `session-abort`) stay green.

## Constraints

- No phase may `process.exit` (the coordinator owns the exit — P0-3's rule).
- Keep `src/lifecycle/index.js` ≤ 150 lines (lint `max-lines` gate).
- No new dependencies.

## Verification

```
node --check src/lifecycle/index.js src/lifecycle/crash.js src/cli.js bin/emile.js
node --test test/lifecycle-crash.test.js
npm run lint && npm test
```
Baseline (2026-10-10): 429 tests / 419 pass / 0 fail / 10 env skips; lint 0 errors.

## Docs sync (Rule 2)

- CHANGELOG `[Unreleased]` → Fixed: a crash (uncaught error / rejected promise)
  now runs the ordered shutdown and prints a redacted one-liner; the fatal path
  no longer clears the screen.
- `docs/architecture.md` lifecycle row + `docs/deep-dive.md` § 18; feature
  registry row in `features/session-lifecycle.md` (or `lifecycle`-owning file).