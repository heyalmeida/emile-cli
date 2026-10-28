# BRIEF P1-15 — Crash paths: route uncaught errors through the shutdown coordinator

> Read first: `specs/2026-10-08-deep-dive-backlog/_shared-constraints.md` and
> `docs/deep-dive.md` § 18 (lifecycle), § 10 (persistence). Complements P0-3
> (landed: real prompt teardown, force-exit on the second signal, atomic writes,
> honest recovery report).
>
> **Re-verified against the post-P0-3 tree (2026-10-10).** `src/lifecycle/index.js`
> is 140 lines and the lint `max-lines` gate for `src/lifecycle/` is 150 — the
> crash logic MUST live in a new file. The coordinator is a local closure inside
> `installShutdownHandlers` (`index.js:82-122`), so it is passed in, not exported.

## Goal

Two verified gaps on the crash path:

1. **No crash hooks at all.** `src/lifecycle/index.js` registers SIGINT/SIGTERM/
   SIGHUP (`:124-126`) and `process.on('exit')` (`:130-133`), but there is NO
   `uncaughtException` and NO `unhandledRejection` handler anywhere in `src/` or
   `bin/` (grep-verified 2026-10-10). An async throw outside the agent's own
   try/catch kills the process through Node's default handler: the 6-phase
   coordinator never runs — the session is not flushed to `complete`, global
   memory is not flushed, MCP children are NOT shut down (orphaned processes),
   and the terminal gets only the minimal `exit`-hook reset. The per-tool
   checkpoints keep most of the turn on disk and P0-3's scanner will report the
   session as `recoverable`, but the crash is silent and the shutdown contract is
   bypassed.
2. **The fatal path destroys the evidence.** `bin/emile.js:7-11`:
   `main().catch((err) => { console.clear(); console.error('Fatal error…', err); process.exit(1); })`
   — `console.clear()` wipes the scrollback (the session the user was reading)
   BEFORE printing, and `process.exit(1)` bypasses the coordinator.
   (`commands/handlers.js:173`'s `console.clear()` is a deliberate `/switch`
   redraw — leave it, it is not an exit path.)

## Current behavior (facts, verified 2026-10-10)

- `exitCodeFor(reason)` (`index.js:36`) already maps anything that is not
  SIGINT/SIGTERM to `1` — a crash reason needs no change there.
- `guard(reason)` (`index.js:53-57`) escalates a second call to
  `forceExit(reason)`; `setForceExit(fn)` (`:42-46`) is the exported test seam.
- `installShutdownHandlers({ verbose, shutdownMcp, flushSync, flushMemory,
  markAborted, shutdownPrompt })` (`:78`) — phases run in order with per-phase
  slices (`:88-114`) and the exit happens at `:121`.
- Redaction precedent to mirror: `formatApiError` (`src/api/client.js:153-159`)
  strips `Bearer …` / `key=value` shapes and control characters and caps the
  length. P1-10 will later centralize a `src/secrets.js` — do NOT depend on it
  here (it has not landed).

## Required design (do not re-derive; implement this)

1. **New `src/lifecycle/crash.js`** (keeps `index.js` inside the 150-line gate):
   - `createFatalHandler({ coordinator, exit = (code) => process.exit(code), print = (line) => process.stderr.write(line) })`
     returning a pure `handleFatal(reason, origin)` that:
     a. prints ONE redacted line on **stderr**:
        `✗ Fatal (<origin>): <redacted message>` where origin ∈
        `uncaughtException | unhandledRejection | bootstrap` and the message is
        `err?.message ?? String(err)` plus `code`/`status` when present — NEVER
        the raw error object (a provider error can carry the request body, i.e.
        the user's content);
     b. calls `coordinator(origin)` exactly once (the coordinator's own `guard`
        covers a second crash — do not add a parallel latch);
     c. never throws: wrap the whole body; a throw inside the handler falls back
        to a best-effort ANSI reset + `exit(1)`.
   - `installCrashHandlers({ coordinator })` wiring
     `process.on('uncaughtException', (err) => handleFatal(err, 'uncaughtException'))`
     and `process.on('unhandledRejection', (reason) => handleFatal(reason, 'unhandledRejection'))`.
     Export `handleFatal` (and the redactor) for tests — drive them directly;
     never `process.emit` inside the node:test runner.
2. **`src/lifecycle/index.js`**: inside `installShutdownHandlers`, after the
   signal handlers, call `installCrashHandlers({ coordinator })` (+1 import,
   +1 line). Keep the file ≤ 150 lines.
3. **`bin/emile.js`**: remove `console.clear()`; route the bootstrap catch
   through the same fatal path (origin `bootstrap`) and let the `exit` hook
   restore the terminal. If startup failed BEFORE `installShutdownHandlers` ran
   there is no coordinator: the handler must fall back to a sync ANSI reset +
   `exit(1)` without crashing.
4. **Do not swallow, do not continue**: an uncaught error still ends the process
   with code 1. This brief buys an orderly exit, not resilience.
5. **Redaction** (local + minimal, inside `crash.js`, exported for tests): strip
   `Bearer\s+\S+`, `(?:api[-_ ]?key|token|secret|password)\s*[:=]\s*\S+`, all C0/C1
   control characters except `\n`, collapse whitespace, cap at 300 chars.

## Tests to add (new file `test/lifecycle-crash.test.js`)

- Drive `handleFatal` with injected fakes: the coordinator runs exactly ONCE,
  `exit` is called with `1`, and the line lands on **stderr** with the origin tag.
- `unhandledRejection` with a NON-Error reason (a string; an object) prints
  something useful and never throws.
- Redaction: an error carrying `Authorization: Bearer supersecret` and
  `api_key=tok123` prints neither token.
- A `coordinator` that throws → the handler still exits 1 and does not rethrow.
- No coordinator (bootstrap before install) → ANSI reset attempted + exit 1.
- Source assertions: `bin/emile.js` contains no `console.clear`;
  `commands/handlers.js` still does (with a comment saying it is intentional).
- Regression: `test/lifecycle-stdin.test.js`, `test/lifecycle-recovery.test.js`,
  `test/session-atomicity.test.js`, `test/session-abort.test.js` stay green.

## Constraints

- No phase may `process.exit` (the coordinator owns the exit — P0-3's rule).
- `src/lifecycle/index.js` ≤ 150 lines (lint `max-lines`).
- No new dependencies.
- Do not touch `agent.js`'s error handling (its try/catch already surfaces
  provider failures); this brief covers the errors that ESCAPE it.

## Verification

```
node --check src/lifecycle/crash.js src/lifecycle/index.js bin/emile.js
node --test test/lifecycle-crash.test.js
npm run lint && npm test
```
Baseline (2026-10-10): 429 tests / 419 pass / 0 fail / 10 env skips; lint exit 0.
`npm test` must exit 0.

## Docs sync (Rule 2)

- CHANGELOG `[Unreleased]` → Fixed: a crash (uncaught error / rejected promise)
  now runs the ordered shutdown and prints one redacted line on stderr; the fatal
  path no longer clears the screen.
- `docs/architecture.md` lifecycle row; `docs/deep-dive.md` § 18 (mark applied)
  + § 21.1 P1-15 row; `features/session-lifecycle.md` Change History.