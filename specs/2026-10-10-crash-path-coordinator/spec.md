# Spec: Route crashes through the shutdown coordinator

| Field | Value |
|-------|-------|
| **ID** | `2026-10-10-crash-path-coordinator` |
| **Status** | `implemented` |
| **Phase/Context** | Lifecycle — deep-dive backlog item **P1-15** (§ 18 shutdown phases) |
| **Related documents** | [Brief P1-15](../2026-10-08-deep-dive-backlog/briefs/p1-15-crash-path-coordinator.md), [Shared constraints](../2026-10-08-deep-dive-backlog/_shared-constraints.md), [deep-dive § 18 / § 21.1](../../docs/deep-dive.md), [Code Quality and Security](../../docs/code-quality-and-security.md), [P0-3 spec](../2026-10-10-lifecycle-recovery-integrity/spec.md), [feature: session-lifecycle](../../features/session-lifecycle.md) |

---

## 1. Problem / Motivation

There is **no** `uncaughtException` or `unhandledRejection` handler anywhere in
`src/` or `bin/` (grep-verified: the only two references in the tree are a test
that fails on them). An asynchronous throw that escapes the agent's own
`try/catch` therefore kills the process through Node's default path, which means
**none** of the ordered shutdown runs:

- the session is never flushed to `complete` (the user loses the turn they were
  watching),
- global memory is never flushed,
- MCP child processes are left orphaned,
- the prompt's stdin lease is never released, and
- all that runs is the minimal `process.on('exit')` ANSI reset.

That is the same surface P0-3 repaired for signals — the crash path was simply
never wired to it.

Separately, the bootstrap catch in `bin/emile.js` calls `console.clear()`
**before** printing the fatal error. A crash therefore wipes the scrollback the
user was reading *and* destroys the evidence of the bug being reported.

## 2. Goal

An uncaught exception or an unhandled rejection runs the existing ordered
shutdown exactly once, prints exactly one redacted line on **stderr** identifying
its origin, exits with code 1, never throws — and no fatal path clears the
screen.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-------------|---------------------|
| RF-S01 | A new `src/lifecycle/crash.js` owns the crash logic (the lint `max-lines` gate for `src/lifecycle/` is 150 and `index.js` is already ~141 lines). | Must |
| RF-S02 | `createFatalHandler({ coordinator, exit, print })` returns a pure `handleFatal(reason, origin)`; `print` defaults to stderr and `exit` to `process.exit`. | Must |
| RF-S03 | `handleFatal` prints exactly ONE line: `✗ Fatal (<origin>): <redacted message>`, where origin ∈ `uncaughtException \| unhandledRejection \| bootstrap`. | Must |
| RF-S04 | The message is `err.message` (or a bounded structural description for non-Error reasons) plus `err.code`/`err.status` when present — **never** the raw error object, because provider errors can carry the request body. | Must |
| RF-S05 | The message is redacted: `Bearer <token>`, `api_key/token/secret/password[:=]<value>`, `sk-…` key shapes and control characters are removed, whitespace collapsed, length capped at 300. | Must |
| RF-S06 | `handleFatal` calls `coordinator(origin)` exactly once when one is installed. The **coordinator owns the exit** (`exitCodeFor` already maps any non-signal reason to 1) — no second re-entrancy latch is added (`guard` already escalates). | Must |
| RF-S07 | Without a coordinator (bootstrap before `installShutdownHandlers`), the handler performs a best-effort ANSI reset and exits 1 itself. | Must |
| RF-S08 | `handleFatal` never throws: the whole body is guarded, and any failure inside it (including a rejecting coordinator) falls back to the ANSI reset + `exit(1)` exactly once. | Must |
| RF-S09 | `installCrashHandlers({ coordinator })` registers both `uncaughtException` and `unhandledRejection`, wired from inside `installShutdownHandlers` so the handlers share the coordinator's own guard. | Must |
| RF-S10 | A crash still ends the process — installing these handlers must not turn a fatal error into a swallowed one, and must never resume the REPL. | Must |
| RF-S11 | No exit path clears the screen: `bin/emile.js` loses its `console.clear()`; the deliberate mid-session `console.clear()` in `/switch` stays. | Must |
| RF-S12 | `src/lifecycle/index.js` stays ≤ 150 lines; the wiring adds only a couple of lines. | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|----------|
| **Risk classification** | **Medium** per [Code Quality and Security § 1](../../docs/code-quality-and-security.md): process exit and terminal state, no data migration. Raised from Low by the fact that installing an `uncaughtException` listener **disables Node's default exit**, so a mistake can turn a fatal crash into a hung or silently-degraded process. |
| **Assets/secrets** | The fatal line can carry provider error text, which may embed request bodies (the user's content) or credentials. Redaction is mandatory (RF-S04/S05). |
| **Command execution / file writes** | None newly: the crash path runs the existing phases, which already flush best-effort and never execute tools. |
| **Untrusted inputs** | The thrown value is untrusted (it can be an object built from a provider response). It is never stringified wholesale; only a bounded structural description is printed, then redacted and capped. |
| **Negative criteria** | Must NOT: `process.exit` from inside a phase; add a second re-entrancy latch; print raw error objects or request payloads; print to stdout; clear the screen on any exit path; grow `src/lifecycle/index.js` past 150 lines; add a dependency; swallow a crash and continue the REPL. |

### 4.1 Failure and rollback analysis

| Failure mode | Containment |
|---|---|
| Installing the handlers swallows the crash | The handler routes to the coordinator, which ends with `process.exit`; with no coordinator it exits itself. Never returns to the REPL (RF-S10). |
| The coordinator throws synchronously or its promise rejects | Caught; fallback ANSI reset + `exit(1)` exactly once (RF-S08). |
| The crash handler itself crashes (e.g. a throwing `print`) | Each step is individually guarded; the last resort is `exit(1)`. |
| Secret leaks into the line | Redaction runs on the assembled message; the raw object is never printed. Verified by a sentinel test (`Bearer supersecret`, `api_key=tok123`). |
| Rollback | Revert the commits: no migration, no persisted format change; removing the handlers restores Node's defaults. |

## 5. Out of Scope

- **Tool-result secret redaction** — **P1-10** (`src/secrets.js` has not landed, so this brief carries its own local redactor).
- **`console.clear()` in `commands/handlers.js:173`** — a deliberate `/switch` redraw, not an exit path (a comment is added to say so).
- **Uncapped cursor-up emitters (P2-19), prompt height budget (P2-18), mid-turn steering (P2-13)**.
- **`agent.js`'s own error handling** — its try/catch already surfaces provider failures; this brief covers only errors that escape it.

## 6. Acceptance Criteria

- **AC-01:** Given an uncaught exception and, separately, an unhandled rejection, then the coordinator runs exactly once and the process exits with code 1.
- **AC-02:** The fatal line goes to **stderr**, carries the origin tag, and is redacted.
- **AC-03:** A non-Error reason (a string; a plain object) prints something useful and never throws.
- **AC-04:** A coordinator that throws still results in exit 1 with no rethrow and no second exit.
- **AC-05:** A crash before `installShutdownHandlers` (no coordinator) attempts the ANSI reset and exits 1 without crashing.
- **AC-06:** `bin/emile.js` contains no `console.clear`; `commands/handlers.js` still does (intentional); `bin/emile.js` routes its bootstrap failure through the same fatal path.
- **AC-07:** `src/lifecycle/index.js` ≤ 150 lines; `node --check` clean; `npm run lint` 0 errors; `npm test` exits 0 with the four P0-3 suites green (429 tests / 419 pass / 0 fail / 10 skips baseline).
- **AC-08:** Rule 2 docs sync: CHANGELOG `[Unreleased] → Fixed`; `docs/architecture.md` lifecycle row; `docs/deep-dive.md` § 18 marked applied + § 21.1 P1-15 ✅; `features/session-lifecycle.md` Change History.

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|---------|--------------------|
| With a handler installed, Node no longer exits automatically on an uncaught exception. | A hung process instead of a crash. | RF-S10 plus the coordinator's terminal `process.exit`; the no-coordinator path exits itself. Documented in the module header. |
| An `uncaughtException` handler can leave the process in an inconsistent state if it continues. | Corrupted state. | We never continue: the handler only prints, delegates to the shutdown, and exits. |
| Printing during a crash could itself throw (closed stderr). | Lost message. | Each step is guarded; the exit still happens. |
| A structural description for object reasons is less informative than a dump. | Slightly harder debugging. | Deliberate: dumping a provider error can leak the user's request body. The keys are shown, which is enough to identify the source. |
| The coordinator's async phases run while the exception's stack is unwinding. | Interleaved output. | Same model as the signal path (already proven by P0-3); the phase slices bound it. |

## 8. References

- `src/lifecycle/index.js` — the coordinator (`:82-122`), signals (`:124-126`), `exit` hook (`:130-133`), `exitCodeFor` (`:36`), `guard` (`:53-57`), `setForceExit` (`:42-46`).
- `bin/emile.js` — the bootstrap catch.
- `src/api/transports/base.js:96-103` — the redaction precedent (`formatApiError`).
- `test/lifecycle-stdin.test.js` — the injected-fakes harness and the exit-seam pattern this spec reuses.
- P0-3 spec — the coordinator contract this change plugs into.