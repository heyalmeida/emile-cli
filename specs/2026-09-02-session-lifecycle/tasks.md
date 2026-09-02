# Tasks: Session lifecycle hardening

> Filled from `plan.md`. Each task is small, verifiable and traceable to an
> acceptance criterion (AC). Mark `- [x]` only after the verification in the
> task description is recorded below (evidence, not checkbox — Rule 3 of
> `specs/README.md`).

| Field | Value |
|-------|-------|
| **Spec** | `2026-09-02-session-lifecycle` |

---

## Phase 0 — Preparation

- [ ] T0.1 — Read relevant documentation: `docs/ROBUSTNESS-ROADMAP.md`, `IMPROVEMENTS.md` §§1.4/1.5/2.1/3.3, `docs/architecture.md` §2 (module map), `docs/code-quality-and-security.md` §4 (gates), `specs/2026-08-30-session-resilience` (sibling spec — do not duplicate), `AGENTS.md` Rule 8 (branch hygiene).
- [ ] T0.2 — Confirm this spec and plan are `approved`.
- [ ] T0.3 — Classify the work as **High risk**; record the threat model and negative criteria in `plan.md` §3 are reproduced in the tests of Phase 2.
- [ ] T0.4 — Create and switch to `feat/session-lifecycle` from `development` (Rule 8). Verify with `git rev-parse --abbrev-ref HEAD` and `git merge-base --is-ancestor development HEAD`.

## Phase 1 — Implementation

### 1.A — `src/lifecycle/`

- [ ] T1.1 — Create `src/lifecycle/{stop-input,drain-tools,flush-session,close-mcp,restore-terminal}.js` as **stubs** that export `run(ctx)` and `{ name, sliceMs }`. The barrel `index.js` exports `installShutdownHandlers({ verbose })` and `runShutdown(reason)`. *(verifies AC-12 layout)*
- [ ] T1.2 — Implement `stop-input.js` (≤ 50 LOC). Calls `promptInput.release()`, sets the module-level `shuttingDown` flag, returns within 50 ms. *(verifies AC-01 step 1)*
- [ ] T1.3 — Implement `drain-tools.js` (≤ 100 LOC). Awaits the active tool via `turnControl.awaitActive(1500)`; on timeout, calls `turnControl.markAborted(id, 'shutdown')` and the existing `executeTool` path with the aborted payload. *(verifies AC-01 step 2)*
- [ ] T1.4 — Implement `flush-session.js` (≤ 60 LOC). Calls `history.flushSync()`. If `flushSync` is missing, implement it as a synchronous fsync of the active session file. *(verifies AC-01 step 3)*
- [ ] T1.5 — Implement `close-mcp.js` (≤ 80 LOC). Iterates the MCP registry, calls `shutdown` per server, waits up to 1 s, then closes stdin. *(verifies AC-02 step 4)*
- [ ] T1.6 — Implement `restore-terminal.js` (≤ 70 LOC). Calls `control.releaseRawMode()`, restores the cursor, exits bracketed-paste. *(verifies AC-01 step 5)*
- [ ] T1.7 — Wire the phases in `index.js` (≤ 120 LOC). Each phase runs in order with a per-phase timer; offenders are named in `--verbose`; the global 3 s cap short-circuits to `process.exit(130)`. *(verifies AC-02, AC-12)*

### 1.B — `src/recovery.js`

- [ ] T1.8 — Create `src/recovery.js` (≤ 150 LOC). Exposes `runStartupRecovery({ cwd, sessionsDir, logger }) → RecoveryReport`. No imports from `src/agent/` or `src/mcp/`. *(verifies AC-03)*
- [ ] T1.9 — Implement the classifier: `recoverable` if `status === 'pending'` and the tool-call batch and `resolveSafePath` agree; `corrupt` otherwise. Wrap each session in `try/catch`; never throw. *(verifies AC-03, AC-05, AC-10)*
- [ ] T1.10 — Implement `moveToCorrupt(sessionId)` via `history.js` (new method, ≤ 30 LOC in `history.js`). *(verifies AC-05)*
- [ ] T1.11 — Wire the call in `src/cli.js` before the REPL is shown. The REPL is shown regardless of the report. *(verifies AC-03, AC-04)*

### 1.C — `src/tools/file-state/` split

- [ ] T1.12 — Extract `read-cache.js` (≤ 120 LOC) from the current `src/tools/file-state.js`. No behavior change. *(refactor; verifies that existing `readFile` tests still pass)*
- [ ] T1.13 — Extract `path.js` (≤ 60 LOC) with `hashContent`, `entryId`, `isInsideUndoDir`. *(supports T1.15)*
- [ ] T1.14 — Create `undo-stack.js` (≤ 100 LOC) with LRU semantics and `setCap(50)`. *(verifies AC-07 logic)*
- [ ] T1.15 — Create `persistence.js` (≤ 150 LOC) with `append`, `rehydrate`, `prune`, `clearSession`. `append` uses `writeFileSync` + `rename` for atomicity. `rehydrate` reads newest-first up to the cap. *(verifies AC-06, AC-07)*
- [ ] T1.16 — Replace `src/tools/file-state.js` with a barrel re-exporting the four sub-modules. Public API unchanged. *(verifies no behavior regression)*
- [ ] T1.17 — Wire `clearSession(sessionId)` from `history.js` into the `/delete` command. *(verifies AC-15)*

### 1.D — `src/config.js`

- [ ] T1.18 — Add `resolveApiKey(provider)` (≤ 30 LOC). Returns the empty string on mismatch. The connect wizard surfaces the missing key. *(verifies AC-08)*
- [ ] T1.19 — Modify `saveUserConfig` to write with `{ mode: 0o600 }` and `chmodSync` the existing file (best-effort). *(verifies AC-09)*

### 1.E — `package.json`

- [ ] T1.20 — Add `"engines": { "node": ">=18" }` and run `npm install` on Node 16 in the smoke matrix to confirm the warning. *(verifies AC-10)*

## Phase 2 — Testing, Security and Verification

- [ ] T2.1 — `test/lifecycle.test.js` (≤ 200 LOC): re-entrancy, phase timeout, signal ordering, verbose-mode lines.
- [ ] T2.2 — `test/recovery.test.js` (≤ 200 LOC): `recoverable` / `corrupt` / `abandoned`, malformed JSON, missing files, symlink escape.
- [ ] T2.3 — `test/undo-persistence.test.js` (≤ 200 LOC): cap overflow discards oldest, rehydrate after restart, symlink refusal, atomic append, per-session isolation, `/delete` clears.
- [ ] T2.4 — `test/config-permissions.test.js` (≤ 200 LOC): per-provider resolution, empty string on mismatch, 0600 on POSIX, warning on Windows (mocked).
- [ ] T2.5 — `test/structure.test.js` (≤ 150 LOC): every file under `src/lifecycle/` and `src/tools/file-state/` is ≤ 150 LOC, exports at most one default or a single namespace, and the responsibility check passes.
- [ ] T2.6 — `node --check` on every touched `.js` file. Record the command and output.
- [ ] T2.7 — `npm run lint`. Record the output.
- [ ] T2.8 — `npm test`. Record the output.
- [ ] T2.9 — Manual smoke: `node bin/emile.js --verbose "echo hi"`, then Ctrl+C mid-stream. Confirm verbose lines for each phase and a clean terminal.
- [ ] T2.10 — Manual smoke: `kill -TERM <pid>` on an idle `emile`. Confirm exit within 3 s, MCP closed, terminal restored.
- [ ] T2.11 — Manual smoke: leave a `pending` checkpoint (simulate with a test fixture), restart `emile`, confirm the recovery report and the resume path.
- [ ] T2.12 — Manual smoke: `npm install` on Node 16 (if available in CI). Confirm the warning.

## Phase 3 — Documentation and Closing

- [ ] T3.1 — `docs/architecture.md`: add rows for `lifecycle/`, `recovery.js`, and the `tools/file-state/` directory.
- [ ] T3.2 — `docs/IMPROVEMENTS.md`: mark §§1.4, 1.5, 2.1, 3.3 as ✅ and link to this spec.
- [ ] T3.3 — `CHANGELOG.md`: add an `[Unreleased]` entry under `Added` (lifecycle, recovery, undo persistence, per-provider key, 0600, engines) and `Changed` (file-state split).
- [ ] T3.4 — `features/session-lifecycle.md`: create the feature registry entry (Rule 7) with a link to the spec and the AC table.
- [ ] T3.5 — Update the spec status to `implemented` and the plan status to `implemented`.
- [ ] T3.6 — Switch to `docs/documentation` and commit **only** the documentation paths above (Rule 8).
- [ ] T3.7 — Record limitations, non-executed verifications and residual risk in the handoff section below.

---

## Acceptance Criteria Verification Log

| AC | Status | Evidence (how it was verified) |
|----|---------|--------------------------------|
| AC-01 | ⏳ | T2.9 — manual Ctrl+C mid-tool; verbose lines for each phase; checkpoint is `complete`/`aborted` not `pending`; terminal cooked. |
| AC-02 | ⏳ | T2.10 — manual `kill -TERM` on idle; exits ≤ 3 s; MCP closed; terminal restored. |
| AC-03 | ⏳ | T2.11 + T2.2 — boot scan returns a report with the expected classification; REPL shown regardless. |
| AC-04 | ⏳ | T2.11 — the existing `specs/2026-08-30-session-resilience` resume path runs; `recovery.js` did not call a tool. |
| AC-05 | ⏳ | T2.2 — corrupt fixtures land in `.emile/sessions/<id>/corrupt/<ts>/`; CLI starts. |
| AC-06 | ⏳ | T2.3 — `popUndo` after rehydrate reverts the previous file exactly. |
| AC-07 | ⏳ | T2.3 — 60 pushes, 51st drops the 1st; `.emile/undo/<id>/` has 50 files. |
| AC-08 | ⏳ | T2.4 — `resolveApiKey('requesty')` returns `''` when only `OPENROUTER_API_KEY` is set. |
| AC-09 | ⏳ | T2.4 + manual `ls -l .emile/config.json` shows `-rw-------`. |
| AC-10 | ⏳ | T2.12 — `npm install` on Node 16 emits `EBADENGINE`. |
| AC-11 | ⏳ | T2.5 — every file under the new dirs is ≤ 150 LOC and has a single responsibility. |
| AC-12 | ⏳ | T2.1 + T2.9 — verbose lines show each phase's name and elapsed ms. |

> Legend: ⏳ pending · ✅ verified · ❌ failed (go back to Phase 1)

---

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| | | |

(Each commit is staged with explicit paths only — Rule 8. No `git add .`.)

---

## Handoff

**Limitations / non-executed verifications / residual risk:**

_(Filled in at close. Any non-executed verification is recorded with the reason. Residual risk is named, not hidden.)_
