# Plan: Session lifecycle hardening

> Filled **after** `spec.md` is `approved`. This document answers HOW the
> spec will be implemented. Module names match the file map in §6 and the
> architectural module table in `docs/architecture.md`.

| Field | Value |
|-------|-------|
| **Spec** | `2026-09-02-session-lifecycle` |
| **Status** | `implemented` |

## 1. Technical Approach

Four small, isolated subsystems, each in its own directory or module family.
No subsystem is allowed to import another subsystem's internals; they
communicate only through the public APIs declared below.

### 1.1 `src/lifecycle/` — ordered shutdown

A new directory. Each phase is a separate file (Rule: one responsibility per
file, ≤ 150 LOC). The barrel `index.js` exposes `installShutdownHandlers()` and
`runShutdown(reason)`.

Phases, in order, with their time slice and the public API they call:

| # | File | Responsibility | Time slice | Public API consumed |
|---|------|-----------------|------------|---------------------|
| 1 | `stop-input.js` | Pause readline, mask new keys, set `shuttingDown = true`. | 50 ms | `promptInput.release()` |
| 2 | `drain-tools.js` | If a tool is in flight, await it for up to 1.5 s; otherwise call `turnControl.markAborted(toolCallId, reason)`. | 1500 ms | `turnControl.markAborted`, `executeTool` (via the existing path) |
| 3 | `flush-session.js` | Synchronous fsync of any pending checkpoint write. | 300 ms | `history.flushSync()` |
| 4 | `close-mcp.js` | Iterate connected MCP servers, call `shutdown`, wait ≤ 1 s. | 1000 ms | `mcp.shutdownAll()` |
| 5 | `restore-terminal.js` | Show cursor, exit raw mode, exit bracketed-paste. | 100 ms | `control.releaseRawMode()` |
| 6 | (coordinator) | Sets exit code, calls `process.exit` once. | 50 ms | — |

Total: 3000 ms (the global cap from RF-L03). The coordinator tracks elapsed
time per phase and surfaces the offender in `--verbose` (AC-12).

The coordinator is **re-entrancy safe**: a second signal after the first is
a no-op except for SIGTERM/SIGINT in a "stuck" phase, where it short-circuits
to `process.exit(130)`.

### 1.2 `src/recovery.js` — startup scan

A single file, no directory. Exposes `runStartupRecovery({ cwd, sessionsDir, logger })` and returns a `RecoveryReport`. Does **not** import from `src/agent/` or `src/mcp/`; it is a pure read/inspect module.

Classification rules:

- `recoverable` — the persisted record has `status: 'pending'`, the assistant message contains a valid tool-call batch, and the file paths referenced in the tool arguments are still inside the workspace. The existing `specs/2026-08-30-session-resilience` resume path is the only consumer.
- `abandoned` — the user previously ran `/delete` or the session was explicitly marked abandoned by a future spec. (This spec introduces the **field** on records but does not populate it; the existing flow does not set it.)
- `corrupt` — anything else: missing files, malformed JSON, mismatched tool-call IDs, an argument path that fails `resolveSafePath`. The file is moved to `.emile/sessions/<id>/corrupt/<ts>/`.

The scan never throws (RF-L10). A `try { … } catch (err) { report.scanErrors.push({ sessionId, error: err.message }) }` wraps each session.

### 1.3 `src/tools/file-state/` — split + persistence

Refactor of the existing `src/tools/file-state.js` into a directory with a barrel. The split is mechanical; no behavior changes for the read cache.

| File | Responsibility | Public API |
|------|-----------------|------------|
| `file-state.js` (barrel) | Re-export everything below. | `readFileCached`, `invalidate`, `pushUndo`, `popUndo`, `undoDepth`, `undoCap`, `rehydrateUndo`, `clearUndoForSession` |
| `read-cache.js` | Existing read cache. | `readFileCached(path)`, `invalidate(path)` |
| `undo-stack.js` | In-memory LRU stack with cap 50. | `push(entry)`, `pop()`, `depth()`, `setCap(n)`, `clear()` |
| `persistence.js` | Mirror to `.emile/undo/<sessionId>/`. | `append(sessionId, entry)`, `rehydrate(sessionId)`, `prune(sessionId, keepIds)`, `clearSession(sessionId)` |
| `path.js` | Helpers: hash, id, realpath containment check. | `hashContent(s)`, `entryId()`, `isInsideUndoDir(p)` |

`pushUndo` now calls `undoStack.push` and then `persistence.append`. `popUndo` removes the entry from both layers. On boot, the CLI calls `persistence.rehydrate(currentSessionId)` and then `undoStack.setCap(50)` followed by `rehydrateUndo` (the barrel's name).

### 1.4 `src/config.js` — per-provider key + 0600

Two localized edits. No new module.

- New helper `resolveApiKey(provider)` that reads the **provider-specific** env var (`REQUESTY_API_KEY` for `requesty`, `OPENROUTER_API_KEY` for `openrouter`, `OPENCODE_API_KEY` for `opencode` and `opencode-go`). If a saved `apiKey` exists in `.emile/config.json` **and** matches the active provider, it is preferred. Cross-provider env vars are ignored.
- `saveUserConfig` writes with `{ mode: 0o600 }` and, before writing, attempts `chmod` on the existing file (no-op if it doesn't exist). On Windows or other failures, the function logs in `--verbose` and continues (AC-09).

### 1.5 `package.json` — engines

Add `"engines": { "node": ">=18" }`. Single field change; no `engines` removal elsewhere.

## 2. Architectural Compliance

- **Relevant ADRs:** ADR-0001 (Node ≥ 18, ESM, no build step), ADR-0002 (quality gates). This spec adds **no new dependency**, so no new ADR is needed.
- **Architecture:** `docs/architecture.md` §2 lists `src/agent/`, `src/api/`, `src/tools/`, `src/ui/`, `src/mcp.js`, `src/skills.js`, `src/plans.js`, `src/prompt.js`, `src/rules.js`, `src/config.js`, `src/commands.js`, `src/history.js`. The new files fit the existing map: `lifecycle/` is a new sub-tree (sibling of `agent/`, `ui/`, `tools/`); `recovery.js` is a new top-level module (justified in §1.2); `tools/file-state/` extends the existing tools domain.
- **Design system:** No new visual element. The only user-facing strings are the dim verbose-mode lines, which use `C.dim` / `C.muted` from `src/ui/theme.js`.

## 3. Security and Threat Model

| Element | Handling |
|----------|----------|
| **Command execution and whitelist** | `drain-tools` calls the **existing** `executeTool` path. Safe mode, dry-run, whitelist and `resolveSafePath` apply unchanged. The coordinator does not bypass any gate. |
| **File writes and `resolveSafePath`** | `persistence.js` writes only under `.emile/undo/<sessionId>/`. `path.js::isInsideUndoDir` checks `realpath` containment; any symlink that escapes is refused. `recovery.js` **never writes** to user files. |
| **LLM inputs (prompt injection / tool args)** | `recovery.js` validates checkpoint JSON shape and does not pass it to any model call. `persistence.js` stores tool-argument paths verbatim; they are only re-evaluated when `/undo` reverts a write, which calls the existing `writeFile` handler. |
| **Secrets (API keys, sessions, exports)** | `resolveApiKey` does not log keys. The verbose-mode `chmod` warning logs the **path** of the config file, not its contents. `/export` is unchanged. |
| **Controls and negative tests** | `test/structure.test.js` (AC-11) checks every new module is ≤ 150 LOC and has a single responsibility (verified by an `eslint-plugin-boundaries` style check or a hand-written AST scan in the test). `test/lifecycle.test.js` covers re-entrancy, phase timeout, and signal ordering. `test/recovery.test.js` covers corrupt/legacy/recoverable classifications. `test/undo-persistence.test.js` covers cap overflow, rehydrate, and symlink refusal. `test/config-permissions.test.js` covers per-provider resolution and 0600 (mocked on Windows). |

## 4. Impacted Modules

| Module | Path | Change |
|--------|------|--------|
| Lifecycle | `src/lifecycle/{index,stop-input,drain-tools,flush-session,close-mcp,restore-terminal}.js` | **Create** (6 files) |
| Recovery | `src/recovery.js` | **Create** |
| File state | `src/tools/file-state/{read-cache,undo-stack,persistence,path}.js` | **Create** (4 files) |
| File state barrel | `src/tools/file-state.js` | **Modify** (becomes a barrel) |
| History | `src/history.js` | **Modify** (expose `flushSync`, `listPending`, `markAborted`, `moveToCorrupt`) |
| MCP | `src/mcp.js` | **Modify** (expose `shutdownAll`) |
| Prompt input | `src/ui/prompt-input-persistent.js` | **Modify** (expose `release`) |
| Turn control | `src/agent/turn-control.js` | **Modify** (expose `markAborted`) |
| CLI | `src/cli.js` | **Modify** (wire shutdown, call recovery on boot) |
| Config | `src/config.js` | **Modify** (per-provider key, 0600) |
| Package | `package.json` | **Modify** (engines) |
| Tests | `test/{lifecycle,recovery,undo-persistence,config-permissions,structure}.test.js` | **Create** (5 files) |
| Docs | `docs/architecture.md`, `docs/IMPROVEMENTS.md`, `CHANGELOG.md`, `features/session-lifecycle.md` | **Modify** (sync) |

## 5. Impacted Flags / Slash Commands / Tools

| Type | Name | Change |
|------|------|--------|
| Slash command | `/undo`, `/delete` | `/undo` works after restart; `/delete` also clears `.emile/undo/<sessionId>/` |
| Slash command | `/sessions clean <days>` | No change to behavior; the cleanup now also prunes orphan undo dirs |
| CLI flag | `--verbose` | New dim lines for each shutdown phase and for `recovery` reports |
| Tool | `writeFile`, `editFile` | Internal: their `undo` push now mirrors to disk |

No new public API on the agent surface.

## 6. Files to Create/Modify

| Action | Path | Notes |
|--------|------|-------|
| Create | `src/lifecycle/index.js` | Barrel + coordinator (≤ 150 LOC) |
| Create | `src/lifecycle/stop-input.js` | Phase 1 |
| Create | `src/lifecycle/drain-tools.js` | Phase 2 |
| Create | `src/lifecycle/flush-session.js` | Phase 3 |
| Create | `src/lifecycle/close-mcp.js` | Phase 4 |
| Create | `src/lifecycle/restore-terminal.js` | Phase 5 |
| Create | `src/recovery.js` | Boot-time scan |
| Create | `src/tools/file-state/read-cache.js` | Extracted from current `file-state.js` |
| Create | `src/tools/file-state/undo-stack.js` | LRU stack with cap |
| Create | `src/tools/file-state/persistence.js` | `.emile/undo/` mirror |
| Create | `src/tools/file-state/path.js` | Hash/id/containment helpers |
| Modify | `src/tools/file-state.js` | Becomes a barrel |
| Modify | `src/history.js` | Adds `flushSync`, `listPending`, `markAborted`, `moveToCorrupt` |
| Modify | `src/mcp.js` | Adds `shutdownAll` |
| Modify | `src/ui/prompt-input-persistent.js` | Adds `release` |
| Modify | `src/agent/turn-control.js` | Adds `markAborted` |
| Modify | `src/cli.js` | Wires shutdown + recovery |
| Modify | `src/config.js` | `resolveApiKey` + 0600 |
| Modify | `package.json` | `engines` |
| Create | `test/lifecycle.test.js` | Re-entrancy, phase timeout |
| Create | `test/recovery.test.js` | Classifications |
| Create | `test/undo-persistence.test.js` | Cap, rehydrate, symlink refusal |
| Create | `test/config-permissions.test.js` | Per-provider, 0600 |
| Create | `test/structure.test.js` | LOC + responsibility check |
| Modify | `docs/architecture.md` | New module rows |
| Modify | `docs/IMPROVEMENTS.md` | Mark §§1.4, 1.5, 2.1, 3.3 as ✅ |
| Modify | `CHANGELOG.md` | `[Unreleased]` entries |
| Create | `features/session-lifecycle.md` | Feature registry entry (Rule 7) |

## 7. Technical Decisions

1. **Phases are awaited, not synchronous.** This is the only way to fsync a checkpoint from a signal handler. We use `process.on('SIGINT', …)` (async) for phases 1–5 and `process.on('exit')` (sync) only to set the exit code.
2. **Re-entrancy guard.** A module-level boolean `shuttingDown` is set on the first signal; subsequent signals become no-ops except the escape hatch described in §1.1.
3. **No new dependency.** `realpath` and `fsyncSync` are Node core. `chmodSync` is core. ESLint already runs in CI (ADR-0002).
4. **Recovery does not run tools.** It only inspects. The existing `specs/2026-08-30-session-resilience` resume path remains the single owner of tool execution on resume. This keeps the attack surface of the new code at zero.
5. **Undo cap is 50, content size cap is 2 MB.** The 2 MB cap is per-entry and refuses files larger than that (with a notice). The 50-entry cap is global per session.
6. **Per-session undo dir.** `.emile/undo/<sessionId>/` keeps undo stacks isolated across sessions. Resuming a session in a different workspace still finds the right dir because session IDs are stable.
7. **`resolveApiKey` is fail-closed.** If the saved key is for a different provider, the function returns the empty string and the connect wizard runs.

## 8. Verification Strategy and Gates

| AC | Test type | Where |
|----|-----------|-------|
| AC-01 | Manual script (signal mid-tool) | `tasks.md` Phase 2 + smoke |
| AC-02 | Manual script (`kill -TERM`) | `tasks.md` Phase 2 |
| AC-03, AC-04, AC-05 | Unit (`recovery.test.js`) + manual boot | `tasks.md` Phase 2 |
| AC-06, AC-07 | Unit (`undo-persistence.test.js`) | `tasks.md` Phase 2 |
| AC-08 | Unit (`config-permissions.test.js`) | `tasks.md` Phase 2 |
| AC-09 | Unit (`config-permissions.test.js`) + manual `ls -l` | `tasks.md` Phase 2 |
| AC-10 | Manual `npm install` on Node 16 (in CI matrix if available) | `tasks.md` Phase 2 |
| AC-11 | Unit (`structure.test.js`) | `tasks.md` Phase 2 |
| AC-12 | Unit (`lifecycle.test.js`) with a fake clock | `tasks.md` Phase 2 |

Mandatory gates for every commit (per `docs/code-quality-and-security.md` §4):

- `node --check` on every touched `.js` file.
- `npm run lint`.
- `npm test`.
- Smoke: `node bin/emile.js --verbose` with a simple task that exercises `writeFile` and `Ctrl+C`.
- No new dependency → no `npm audit` required.

## 9. Git Workflow

| Item | Answer |
|------|--------|
| **Feature branch** | `feat/session-lifecycle` from `development`. |
| **Documentation branch** | `docs/documentation` for `docs/`, `features/`, `CHANGELOG.md` and `specs/` closeout. |
| **Commit plan** | (1) `lifecycle` + tests; (2) `recovery.js` + tests; (3) `tools/file-state/` split + tests; (4) `config.js` per-provider + 0600 + tests; (5) `package.json` engines; (6) on `docs/documentation`: docs sync + CHANGELOG + feature registry. Never `git add .`. Stage only the explicit paths above. |

## 10. Failures, Partial State and Rollback

| Topic | Strategy |
|-------|----------|
| **Error handling in a phase** | Each phase catches its own errors, records `{ phase, error, elapsedMs }` in the report, and lets the coordinator continue. |
| **Interruption (Ctrl+C, Esc)** | The coordinator's re-entrancy guard collapses repeated signals to a single shutdown. |
| **Partial undo persistence** | `persistence.append` uses `writeFileSync` + `rename` to be atomic. A crash mid-`rename` leaves the previous state intact; the new entry is either fully present or fully absent. |
| **Recovery of a corrupt session** | The session file is moved (not copied) to `corrupt/`. A new empty session is created on resume. The user can inspect the moved files. |
| **Rollback** | Reverting the spec's commits returns the codebase to the previous state. `.emile/undo/` is gitignored; leftover dirs can be deleted by hand. |

## 11. Technical Risks and Trade-offs

| Risk | Likelihood | Mitigation |
|------|------------|-----------|
| A signal handler cannot run async work in older Node versions | Low | Node ≥ 18 supports async signal handlers; the README already requires it. The coordinator also installs a `process.on('exit')` (sync) as a safety net. |
| `chmod 0600` rejected on some shared filesystems | Low | The function logs in `--verbose` and continues; the file is still written. |
| `realpath` traversal check in `persistence.js` could false-positive on bind mounts | Low | Containment is checked with `path.relative` after `realpath`; `..` segments at the boundary are treated as outside. |
| The refactor of `file-state.js` regresses an existing read-cache test | Medium | `test/structure.test.js` only enforces the new constraints; the existing `test/` is run after the refactor and any regression is fixed in the same commit. |
| `recovery.js` adds boot latency | Low | The scan is a directory read + JSON parse per session. With 50 sessions and the existing JSON size cap, it completes in tens of ms. |
