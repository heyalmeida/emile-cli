# Plan: Route crashes through the shutdown coordinator

> Filled from the approved `spec.md`. The design is fixed by brief P1-15 and is
> not re-derived here; this document records how it lands.

| Field | Value |
|-------|-------|
| **Spec** | `2026-10-10-crash-path-coordinator` |
| **Status** | `implemented` |

---

## 1. Technical Approach

One new module plus three small wirings. No new dependency.

### 1.1 `src/lifecycle/crash.js` (new)

The lint `max-lines` gate for `src/lifecycle/` is 150 and `index.js` is already
141 lines, so the crash logic is its own file (RF-S01).

```js
export function redactFatalMessage(value)            // RF-S05
export function describeFatalReason(reason)          // RF-S04
export function createFatalHandler({ coordinator, exit, print })
export const handleFatal                             // default: no coordinator
export function installCrashHandlers({ coordinator })// RF-S09
```

**`describeFatalReason(reason)`** — bounded, never a dump:

- `null`/`undefined` → `String(reason)`;
- a string → itself;
- an object with a string `message` → that message;
- any other object → `Object.prototype.toString.call(reason)` plus up to eight
  own keys, e.g. `[object Object] keys=[status, body]`. **No values.** A provider
  error can carry the user's request body, so the shape is all we print (RF-S04);
- then `err.code` / `err.status` are appended when present.

**`redactFatalMessage(value)`** — mirrors the `formatApiError` precedent
(`src/api/transports/base.js:96-103`) and adds `password`:

```js
String(value)
  .replace(/bearer\s+\S+/gi, 'Bearer [redacted]')
  .replace(/((?:api[-_ ]?key|token|secret|password)\s*[:=]\s*)\S+/gi, '$1[redacted]')
  .replace(/\bsk-(?:ant-)?[A-Za-z0-9_-]{8,}\b/g, '[redacted]')
  .replace(/[\u0000-\u0009\u000b-\u001f\u007f\u0080-\u009f]/g, '') // C0/C1 except \n
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 300);
```

**`createFatalHandler({ coordinator, exit = (c) => process.exit(c), print = (l) => process.stderr.write(l) })`**
returns a pure `handleFatal(reason, origin)`:

1. print one line — `✗ Fatal (<origin>): <redacted>` + `\n` — to **stderr**;
2. `coordinator(origin)` **exactly once** when one is installed. The coordinator
   owns the exit: `exitCodeFor('uncaughtException')` is already `1`, and adding a
   second latch would fight `guard()` (RF-S06);
3. no coordinator (bootstrap) → best-effort ANSI reset + `exit(1)`;
4. every step individually guarded; a synchronous throw or a rejecting
   coordinator promise lands in the same fallback, **once** (RF-S08).

A module-level `handleFatal` is exported with no coordinator, so the bootstrap
path and the tests can drive it directly.

### 1.2 Wiring

- **`src/lifecycle/index.js`**: one import line + `installCrashHandlers({ coordinator })`
  after the signal registrations (~2 lines, keeping the file under 150).
- **`bin/emile.js`**: drop `console.clear()`; route the bootstrap catch through
  `handleFatal(err, 'bootstrap')` so the same redacted line and the same exit
  contract apply before any coordinator exists.
- **`commands/handlers.js:173`**: unchanged; a comment records that the
  `console.clear()` there is the intentional `/switch` redraw, not an exit path.

## 2. Architectural Compliance

- **Relevant ADR(s):** ADR-0001 (pure ESM, no dependency) — respected.
  ADR-0002 (quality gates) — new suite plus the standard gates.
  No new ADR: the coordinator keeps owning the exit, and the crash path is
  another entry point into the same contract.
- **Architecture document:** the `lifecycle/` row gains the crash hooks; nothing
  about module ownership changes.
- **Design system:** the fatal line is plain text on stderr with the existing `✗`
  marker and no colour codes, so it survives a broken terminal.

## 3. Security and Threat Model

| Element | Handling |
|----------|------------|
| Command execution and whitelist | Not applicable — no tool path involved. |
| File writes and `resolveSafePath` | The crash path runs the existing phases; nothing new is written. |
| LLM inputs (prompt injection / tool args) | The thrown value is untrusted and may embed provider output; it is described structurally and redacted, never dumped. |
| Secrets (API keys, sessions, exports) | The redactor removes Bearer/key/token/secret/password/`sk-` shapes; asserted with sentinel values. |
| Controls and negative criteria | AC-02/AC-03 pin the line and its safety; AC-04/AC-05 the never-throw contract; AC-06 the screen; AC-07 the gates and the file budget. |

## 4. Impacted Modules

| Module | Path | Change |
|--------|---------|---------|
| Lifecycle | `src/lifecycle/crash.js` | **New**: redactor, reason describer, fatal handler factory, crash-hook installer. |
| Lifecycle | `src/lifecycle/index.js` | Wires the crash hooks to the coordinator (2 lines). |
| Bootstrap | `bin/emile.js` | No screen clear; bootstrap failures go through the fatal path. |
| Commands (comment only) | `src/commands/handlers.js` | Note that its `console.clear()` is intentional. |
| Tests | `test/lifecycle-crash.test.js` | New suite. |

## 5. Impacted Flags / Slash Commands / Tools

| Type | Name | Change |
|------|------|--------|
| CLI flag | — | none |
| Slash command | — | none |
| Tool | — | none |
| Process behaviour | crash handling | an escaped error now shuts down in order and prints one redacted stderr line instead of Node's default dump |

## 6. Files to Create/Modify

| Action | Path | Notes |
|------|--------|-------|
| Create | `specs/2026-10-10-crash-path-coordinator/{spec,plan,tasks}.md` | this pack |
| Create | `src/lifecycle/crash.js` | the crash path |
| Create | `test/lifecycle-crash.test.js` | unit + source assertions |
| Modify | `src/lifecycle/index.js` | wire the hooks |
| Modify | `bin/emile.js` | no `console.clear`, bootstrap through the fatal path |
| Modify | `src/commands/handlers.js` | comment only |
| Modify | `CHANGELOG.md`, `docs/architecture.md`, `docs/deep-dive.md`, `features/session-lifecycle.md`, `specs/2026-10-08-deep-dive-backlog/README.md` | Rule 2 / Rule 7.4 |

## 7. Technical Decisions (summary)

1. **A separate module, not more lines in `index.js`** — the 150-line gate is
   9 lines away (RF-S01/RF-S12).
2. **The coordinator owns the exit; the handler does not compete.** P0-3's
   `guard()` already escalates a second entry, and `exitCodeFor` already yields 1
   for a crash reason — adding a latch or an exit here would double-manage the
   same decision (RF-S06).
3. **A structural description for object reasons instead of `JSON.stringify`.**
   A provider error object can contain the request body (the user's content); the
   shape plus key names identify the source without leaking it (RF-S04).
4. **The redactor is local, not `src/secrets.js`.** P1-10 has not landed; this
   brief must not pre-empt it, and the two regexes it needs already exist in the
   tree (`formatApiError`).
5. **`handleFatal` is exported with no coordinator** so the bootstrap path and the
   tests share one implementation (no second copy for the early crash case).
6. **Installing the hooks changes Node's defaults — documented, not hidden.** With
   a listener present Node no longer exits by itself, which is exactly why the
   handler must (and does) end the process (RF-S10).

## 8. Verification Strategy and Gates

| AC | Check |
|----|---------|
| AC-01 | `test/lifecycle-crash.test.js`: a fake coordinator counts calls and a spied exit records codes; both the exception and the rejection path run it once and exit 1. |
| AC-02 | The captured `print` calls go through a stderr recorder; the line carries the origin tag. |
| AC-03 | Non-Error reasons: a string and a plain object; assert the line is useful, bounded, and that nothing throws. |
| AC-04 | A coordinator that throws synchronously and one that rejects → exit 1 once, no rethrow. |
| AC-05 | No coordinator → the ANSI reset sequence is printed and exit 1 happens; a throwing `print` still exits. |
| AC-06 | Source assertions on `bin/emile.js` (no `console.clear`) and `src/commands/handlers.js` (still there); plus a `handleFatal(err, 'bootstrap')` smoke. |
| AC-07 | `node --check` ×3, the new suite, the four P0-3 suites, `npm run lint`, `npm test` (exit 0), and a line-count check on `src/lifecycle/index.js`. |
| AC-08 | Docs diff review + Rule 5 table validation. |

Commands (Rule 6.3): `node --check src/lifecycle/crash.js src/lifecycle/index.js
bin/emile.js`; `node --test test/lifecycle-crash.test.js`; `npm run lint`;
`npm test`. Smoke: a real uncaught crash needs an interactive run; the suite
drives the pure handler and the source assertions cover the wiring, with the
interactive confirmation recorded as non-executed.

## 9. Git Workflow

| Item | Answer |
|------|--------|
| **Working branch** | `development` (confirmed); no switch/branch/worktree (Rule 8). |
| **Commit plan** | (1) spec + `crash.js` + `index.js` + `bin/emile.js` + `handlers.js` comment + tests; (2) docs. Explicit paths only. |

## 10. Failures, Partial State and Rollback

| Topic | Strategy |
|------|------------|
| Error handling and user-facing messages | One redacted stderr line, no colour dependency, origin-tagged. |
| Interruption (Ctrl+C / Esc) and stdin state | Unchanged — the signal path is untouched; a crash also passes through phase 1's prompt teardown via the coordinator. |
| Partial state | The phases already flush best-effort; the crash path adds no new state. |
| Rollback / undo | Revert the commits; Node's defaults return with the handlers gone. |

## 11. Technical Risks and Trade-offs

| Risk | Likelihood | Mitigation |
|-------|---------------|-----------|
| The crash handler hides a bug by exiting "cleanly". | Certain by design | The line always prints the origin and message, and the exit code stays 1 — the failure is reported, not papered over. |
| Running async phases while an exception unwinds. | Certain, benign | Same model as the signal path; phase slices bound it and the exit is terminal. |
| Redaction misses a novel secret shape. | Medium | Two-layer defense: nothing is stringified wholesale, and P1-10 will centralize the redactor. Reported as residual risk. |