# Tasks: Route crashes through the shutdown coordinator

| Field | Value |
|-------|-------|
| **Spec** | `2026-10-10-crash-path-coordinator` |

---

## Phase 0 — Preparation

- [x] T0.1 — Read the brief, `.clinerules`, deep-dive § 18/§ 21.1, code-quality § 1–6, the lifecycle coordinator, `bin/emile.js` and the redaction precedent (`src/api/transports/base.js:90-103` — `formatApiError` lives there now, not in `client.js`)
- [x] T0.2 — Spec and plan `approved` before any code (Rule 3 order); flipped to `implemented` at close
- [x] T0.3 — Risk classified **Medium** (process exit + terminal state, no data migration); the failure/rollback table is spec § 4.1
- [x] T0.4 — Branch `development`, `git status` inspected (Rule 8)
- [x] T0.5 — Baseline: `npm test` 429/419 pass/0 fail/10 skipped; `npm run lint` 0 errors / 144 warnings
- [x] T0.6 — Facts re-verified: **no** `uncaughtException`/`unhandledRejection` hook exists in `src/` or `bin/` (only two references, both in a test that fails on them); `guard`/`exitCodeFor`/`setForceExit` behave as P0-3 left them; `index.js` was 141 lines against a 150-line gate
- [x] T0.7 — Confirmed the coordinator is a local closure inside `installShutdownHandlers` (so it must be passed to a separate installer) and that `exitCodeFor` already maps a crash reason to 1 (no change needed there)

## Phase 1 — Implementation

- [x] T1.1 — New `src/lifecycle/crash.js` with `redactFatalMessage` (Bearer / `api_key|token|secret|password` / `sk-…` shapes, C0/C1 except `\n`, whitespace collapsed, capped at 300) *(RF-S05)*
- [x] T1.2 — `describeFatalReason`: message, or a bounded structural description for object reasons (shape + up to 8 key names, **no values**), plus `code`/`status` when present — the raw object is never serialized *(RF-S04)*
- [x] T1.3 — `createFatalHandler({ coordinator, exit, print })` → one redacted stderr line, `coordinator(origin)` exactly once when installed, never throws, and a single-shot fallback (ANSI reset + `exit(1)`) for a missing/throwing/rejecting coordinator or a broken printer *(RF-S02, RF-S03, RF-S06, RF-S07, RF-S08)*
- [x] T1.4 — `installCrashHandlers({ coordinator })` registers both hooks and returns the handler *(RF-S09)*
- [x] T1.5 — `src/lifecycle/index.js` wires the hooks to its coordinator (import + call, keeping the file under the gate) *(RF-S09, RF-S12)*
- [x] T1.6 — `bin/emile.js`: `console.clear()` removed, the bootstrap catch routes through `handleFatal(err, 'bootstrap')` *(RF-S11)*
- [x] T1.7 — `src/commands/handlers.js`: comment only, marking the `/switch` `console.clear()` as intentional
- [x] T1.8 — No second re-entrancy latch and no competing exit: the coordinator keeps owning both (F4/RF-S06)

## Phase 2 — Tests and gates

- [x] T2.1 — `test/lifecycle-crash.test.js` (12): coordinator-once + exit 1 for both origins, the origin tag, `code`/`status`; redaction sentinels; string/object/`null`/`undefined`/exotic reasons; throwing and rejecting coordinators; the bootstrap fallback; a throwing printer; the default export; the wiring test against the real coordinator; the source guards; the line budget *(AC-01..AC-07)*
- [x] T2.2 — `node --check` on the four touched files → clean
- [x] T2.3 — New suite 12/12; full suite **441 / 431 pass / 0 fail / 10 skipped**, stable across three consecutive runs *(AC-07)*
- [x] T2.4 — `npm run lint` → 144 problems (0 errors, 144 warnings) = baseline; line budgets 133 and 146 (gate 150)
- [x] T2.5 — `npm audit` not applicable (no dependency)
- [x] T2.6 — **Harness race found and fixed (disclosed)**: the wiring test originally restored its `process.exit` spy in `t.after` while the coordinator was still draining — a late real `process.exit` could kill the test process, which is the mechanism behind the single unexplained full-run failure reported in the P0-3 brief. The spy now outlives the test (file-level) and the test **waits** for the coordinator's exit instead of sleeping. The same latent race in `test/lifecycle-stdin.test.js` (P0-3) was fixed the same way. Test-only change.
- [x] T2.7 — Every acceptance criterion verified; log below

## Phase 3 — Documentation and Closing

- [x] T3.1 — `CHANGELOG.md` `[Unreleased] → Fixed`, including the behaviour note that installing the hooks disables Node's default dump-and-exit
- [x] T3.2 — `docs/architecture.md`: the `lifecycle/` row names `crash.js` and its behaviour cell states the crash contract
- [x] T3.3 — `docs/deep-dive.md`: § 18 gains the crash note; § 21.1 **P1-15** ✅
- [x] T3.4 — `features/session-lifecycle.md` Change History row; pack status row
- [x] T3.5 — Rule 0: 3 shifted `lifecycle/index.js` citations repaired and audited (0 flagged); the P1-15 row verified consistent with its own table header (7 vs 7)
- [x] T3.6 — Spec and plan status → `implemented`
- [x] T3.7 — Committed in two coherent units with explicit paths
- [x] T3.8 — Limitations and residual risk recorded below

---

## Acceptance Criteria Verification Log

| AC | Status | Evidence |
|----|--------|----------|
| AC-01 | ✅ | `an uncaught exception prints one redacted stderr line, runs the coordinator once and exits 1` and its rejection twin assert a single coordinator call and code 1; the wiring test drives the **real** coordinator through the installed hook and observes `exitCodes === [1]` with every phase run exactly once, including the MCP phase |
| AC-02 | ✅ | The line is captured through the injected `print` and matches `/^✗ Fatal \(uncaughtException\): …\n$/`; redaction tests use sentinels (`Bearer supersecret`, `api_key=tok123`, `sk-ant-abcdefgh12345678`) and assert none survives |
| AC-03 | ✅ | A string prints as-is; a plain object prints `[object Object] keys=[status, body]` with the payload and nested keys absent; `null`, `undefined`, `0`, `false`, a Symbol, a function and an array each produce exactly one line without throwing |
| AC-04 | ✅ | A synchronously throwing coordinator and a rejecting one both exit 1 exactly once, with no rethrow and the terminal reset attempted |
| AC-05 | ✅ | `with no coordinator (bootstrap)…` asserts the message, the ANSI reset and exit 1; a throwing printer still exits 1 |
| AC-06 | ✅ | `bin/emile.js` has no `console.clear` and routes through `handleFatal(err, 'bootstrap')`; `commands/handlers.js` keeps its documented `/switch` clear; a source guard asserts no `\x1B[2J` in the crash/restore/coordinator files |
| AC-07 | ✅ | `node --check` ×4 clean; 12/12 new; full suite 441/431 pass/0 fail (baseline 429 + 12) across three runs; lint 0 errors / 144 warnings; `crash.js` 133 and `index.js` 146 lines |
| AC-08 | ✅ | CHANGELOG + architecture (row + behaviour) + deep-dive § 18/§ 21.1 + features registry + pack status; citation audit clean |

## Verification Log (commands and results)

| Command | Result |
|---------|--------|
| `npm test` (baseline) | 429 / 419 pass / 0 fail / 10 skipped |
| `npm run lint` (baseline) | 144 problems (0 errors, 144 warnings) |
| `node --check src/lifecycle/crash.js src/lifecycle/index.js bin/emile.js src/commands/handlers.js` | exit 0 |
| `node --test test/lifecycle-crash.test.js` | **12 / 12 pass** |
| full suite ×3 | 441 / 431 pass / 0 fail — stable |
| `npm run lint` (post) | 144 problems (0 errors, 144 warnings) |
| line budgets | `crash.js` 133, `index.js` 146 (gate 150) |
| citation audit | 3 `lifecycle/index.js` citations, 0 flagged |

## Limitations / Residual Risk

- **Interactive crash smoke not executed**: a real `uncaughtException` inside a live session needs an interactive run. The suite drives the pure handler, and the wiring test invokes the registered listener directly (the runner must not receive a real signal). A manual check is worthwhile: throw from a slash command and confirm the one redacted line, the ordered shutdown and exit code 1.
- **Installing the hooks disables Node's default dump-and-exit** — deliberate and documented; the handler always ends the process. A future contributor who drops the exit would leave a hung REPL, which is why the behaviour is stated in the module header, the spec and the CHANGELOG.
- **Redaction is two-layer but local**: nothing is serialized wholesale and the patterns mirror `formatApiError`, but a secret shape neither layer knows would still print (bounded to the message, capped at 300 chars). **P1-10** will centralize `src/secrets.js`; reported, not solved here.
- **Test-harness hardening (disclosed)**: `test/lifecycle-crash.test.js` keeps its `process.exit` spy for the whole file and waits for the coordinator's exit, because the coordinator exits asynchronously. The same latent race existed in P0-3's `test/lifecycle-stdin.test.js` — it explains the single unexplained full-run failure noted in that brief's report — and was fixed there too. Both are test-only changes.
- **Out of scope, untouched**: tool-result redaction (P1-10), `commands/handlers.js`'s `console.clear()` (intentional), P2-19/P2-18/P2-13, and `agent.js`'s own error handling.

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| ⏳ | `fix(lifecycle): route crashes through the shutdown coordinator` | `src/lifecycle/crash.js`, `src/lifecycle/index.js`, `bin/emile.js`, `src/commands/handlers.js`, `test/lifecycle-crash.test.js`, `test/lifecycle-stdin.test.js`, spec pack |
| ⏳ | `docs: sync the crash-path change` | `CHANGELOG.md`, `docs/architecture.md`, `docs/deep-dive.md`, `features/session-lifecycle.md`, pack README |