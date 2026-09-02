# Spec: Session lifecycle hardening (lifecycle, recovery, undo persistence, config)

| Field | Value |
|-------|-------|
| **ID** | `2026-09-02-session-lifecycle` |
| **Status** | `implemented` |
| **Phase/Context** | Phase 3 — Agent Robustness · Wave 1 of [`docs/ROBUSTNESS-ROADMAP.md`](../../docs/ROBUSTNESS-ROADMAP.md) |
| **Related documents** | [PRD](../../docs/product.md) · [Architecture](../../docs/architecture.md) · [Code Quality & Security](../../docs/code-quality-and-security.md) · [Visual Identity](../../docs/visual-identity.md) · [Robustness Roadmap](../../docs/ROBUSTNESS-ROADMAP.md) · [IMPROVEMENTS.md](../../docs/IMPROVEMENTS.md) §§1.4, 1.5, 2.1, 3.3 · [ADR-0001](../../docs/adr/0001-tech-stack-choice.md) · [ADR-0002](../../docs/adr/0002-quality-gates.md) |

> **Scope note.** The existing `specs/2026-08-30-session-resilience` already covers
> `tool_pending` checkpoints and session-summary refresh. This spec is
> **Wave 1 of the robustness program** and is **strictly additive** to that
> work: it does not modify the checkpoint record format, the agent loop, or
> the session JSON shape introduced there. New state machines are introduced
> in **dedicated modules** (`lifecycle/`, `recovery.js`, `tools/file-state/`).
> A diagram of the division lives in `docs/ROBUSTNESS-ROADMAP.md` §2.

---

## 1. Problem / Motivation

`docs/ROBUSTNESS-ROADMAP.md` (this PR) groups four independently small
hardening changes that share a single theme: **the program never corrupts
state, never loses undo, never leaks handles, and never silently misroutes
credentials.** Each item is tracked separately in `IMPROVEMENTS.md` (§§1.4,
1.5, 2.1, 3.3) and is currently open. Three of them are
**High risk** because they touch every exit path, every persisted session,
or every credential read on disk.

| # | Pain | Reference |
|---|------|-----------|
| L1 | Ctrl+C, SIGTERM, terminal close or process crash mid-tool leaves MCP servers without a `shutdown`, readline in raw mode, and the session checkpoint in an undefined state. | `docs/ROBUSTNESS-ROADMAP.md` L1; §7 of this spec |
| L2 | A checkpoint left as `pending` (now recoverable as a tool batch by `specs/2026-08-30-session-resilience`) is not inspected at boot. The next session can resume on top of an unverified record. | `docs/ROBUSTNESS-ROADMAP.md` L2 |
| L7 | The undo stack lives in memory only; `emile` exit discards it, and there is no upper bound on entries — long sessions grow without limit. | `docs/ROBUSTNESS-ROADMAP.md` L7; `IMPROVEMENTS.md` §1.5 |
| L4 | `apiKey` falls back across providers (any env var wins), masking the misconfiguration as a 401. `.emile/config.json` is written with the process umask — readable by other users on the host. | `docs/ROBUSTNESS-ROADMAP.md` L4; `IMPROVEMENTS.md` §§1.4, 2.1 |
| G12 | `package.json` does not advertise the `>=18` Node engine the README already requires. | `IMPROVEMENTS.md` §3.3 |

## 2. Goal

After this spec:

1. Every exit path (Ctrl+C, SIGTERM, SIGHUP, unhandled rejection, normal `exit`) runs an **ordered, time-bounded shutdown** that drains tool calls, flushes the session, closes MCP, restores the terminal, and exits within 3 s in the worst case.
2. On boot, every persisted session is **scanned for `pending` checkpoints** and classified as `recoverable`, `abandoned` or `corrupt` before the REPL is shown. The user is informed in `--verbose` mode.
3. The undo stack is **persisted under `.emile/undo/<sessionId>/`** with a hard cap of 50 entries; `/undo` survives `emile` restart; cap overflow discards the oldest entry and logs it.
4. The API key is resolved **per provider**; a `requesty` provider never silently picks up an `OPENROUTER_API_KEY`. `.emile/config.json` is written with mode `0600`, and an existing file is re-chmod'd on the next save.
5. `package.json` declares `"engines": { "node": ">=18" }`; `npm install` warns on older Node.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-------------|---------------------|
| RF-L01 | A new `src/lifecycle/` module exports an `installShutdownHandlers()` that wires SIGINT, SIGTERM, SIGHUP, `process.on('exit')` and `unhandledRejection` to a single ordered shutdown. | Must |
| RF-L02 | Shutdown executes **phases in order**: stop-input → drain-tools → flush-session → close-mcp → restore-terminal → exit. Each phase reports its duration in `--verbose` mode. | Must |
| RF-L03 | Shutdown is bounded by a global 3 s timeout; if a phase exceeds its slice, the coordinator logs the offender and continues. | Must |
| RF-L04 | `drain-tools` either waits for the active tool to complete and persists the result, or marks the in-flight tool as `aborted` and persists an error result with the existing `executeTool` path. It must not call `process.exit` itself. | Must |
| RF-L05 | `flush-session` is a synchronous fsync of any pending checkpoint write before the process exits. | Must |
| RF-L06 | `close-mcp` issues a graceful `shutdown` to every connected server and waits up to 1 s before forcing the close. | Must |
| RF-L07 | `restore-terminal` resets raw mode, bracketed-paste and the cursor — independent of which prompt module is active. | Must |
| RF-L08 | A new `src/recovery.js` is invoked once on boot, before the first user input. It scans `.emile/sessions/`, classifies every `pending` checkpoint, and returns a `RecoveryReport`. | Must |
| RF-L09 | A `pending` checkpoint is classified as `recoverable` when the assistant tool-call batch and the on-disk state are consistent; as `abandoned` when the user explicitly skipped recovery; as `corrupt` otherwise. A `recoverable` record is left to the existing `specs/2026-08-30-session-resilience` resume path. | Must |
| RF-L10 | `src/recovery.js` never throws; a partial scan failure is recorded in the report and the CLI continues to start. | Must |
| RF-L11 | `src/tools/file-state/` is split into `read-cache.js`, `undo-stack.js`, `persistence.js` and `path.js`, with `file-state.js` as a barrel. Each module has a single responsibility. | Must |
| RF-L12 | Every push to the undo stack is mirrored to `.emile/undo/<sessionId>/<entryId>.json` with `{ path, hash, content, ts }`. | Must |
| RF-L13 | The stack is bounded at 50 entries. On overflow the oldest entry is dropped from memory and its file is removed. A dim `undo: cap reached, dropped oldest` notice is logged in `--verbose`. | Must |
| RF-L14 | On boot, the stack is rehydrated from `.emile/undo/<currentSessionId>/` (newest first, up to 50) so `/undo` works after restart. | Must |
| RF-L15 | When a session is deleted via `/delete` or expired, `.emile/undo/<sessionId>/` is also removed. | Must |
| RF-L16 | `config.resolveApiKey(provider)` returns the key for the active provider only; cross-provider env vars are ignored. The connect wizard surfaces the missing key explicitly. | Must |
| RF-L17 | `config.saveUserConfig()` writes `.emile/config.json` with `mode: 0o600`. An existing file is `chmod 0600`'d on the next save. If the filesystem rejects the permission (e.g. FAT), the function logs in `--verbose` and continues. | Must |
| RF-L18 | `package.json` gains `"engines": { "node": ">=18" }`. `README.md` keeps its existing `Node >= 18` requirement (no change needed unless wording diverges). | Must |
| RF-L19 | All new modules are **≤ 150 LOC** and have **one** clear responsibility. `src/cli.js`, `src/mcp.js`, `src/history.js`, `src/ui/prompt-input-persistent.js` and `src/agent/turn-control.js` are edited only to expose narrow public APIs; their public contracts are not broken. | Must |
| RF-L20 | New code reuses the existing UI palette (`C.*`) and the `stripTerminalControls` sanitizer for any file content rendered to the terminal. No new ANSI sequences are introduced. | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|--------|
| **Risk classification** | **High.** This spec touches every exit path (Ctrl+C, SIGTERM, SIGHUP, unhandled rejection, normal exit), every persisted session, and every credential read on disk. Three of the four original `IMPROVEMENTS.md` items it closes are also High. |
| **Assets / secrets** | `.emile/config.json` (API key), `.emile/sessions/*` (chat + checkpoints), `.emile/undo/*` (file snapshots). |
| **Command execution / file writes** | `drain-tools` and `flush-session` are the only phases that touch I/O. `drain-tools` calls the existing `executeTool` path (safe-mode, dry-run, whitelist and `resolveSafePath` apply unchanged). `flush-session` uses the existing history write path. `persistence.js` writes only under `.emile/undo/<sessionId>/`, which is inside the workspace's `.emile/` root and is gitignored. |
| **Untrusted inputs** | Persisted checkpoint JSON, `.emile/undo/*` JSON and `tool_call` payloads are all untrusted. `recovery.js` validates the shape with the existing JSON parsers and never executes a tool. `persistence.js` writes only the captured file content (no shell interpolation). |
| **Negative criteria** | The shutdown coordinator **must not** execute a tool, **must not** call `process.exit` from inside a phase, **must not** weaken safe mode or `resolveSafePath`, **must not** block longer than 3 s, and **must not** throw across phase boundaries. `recovery.js` **must not** run tools, **must not** delete user files, and **must not** throw. The undo persistence **must not** follow symlinks out of `.emile/undo/`. The API key resolver **must not** return a key from a different provider. The config writer **must not** silently widen permissions if `chmod` fails. |
| **Threat model** | The main attack surface is a malicious or corrupt checkpoint JSON that tries to (a) trick `recovery.js` into running a tool, or (b) make `drain-tools` execute a side-effecting call during shutdown. Both are blocked: `recovery.js` is read-only, and `drain-tools` only acts on the in-flight tool the agent already accepted (never on data read from disk). Symlink traversal in `.emile/undo/` is prevented by `realpath` checks in `persistence.js`. |
| **Provider leakage** | The `apiKey` per-provider resolver prevents the **silent** misroute that currently produces 401s. It does not introduce new attack surface: a key that was already reachable via the env is still reachable, but it is no longer used for the wrong provider. |

> This spec's risk is High; the negative criteria above are mandatory and reappear in `plan.md` §3 and in the test plan in `tasks.md` Phase 2.

## 5. Out of Scope

- **ACP / Agent Client Protocol** — deferred per `docs/ROBUSTNESS-ROADMAP.md` §6 (B1).
- **Background tasks / `/loop`** — deferred per `docs/ROBUSTNESS-ROADMAP.md` §6 (B3).
- **Retry / backoff / circuit breaker** — Wave 2 of the robustness program.
- **MCP consent re-validation on tools-list change** — Wave 2.
- **`/compact [note]` and plan-mode preservation across compaction** — Wave 2.
- **Permission modes (default/auto/always-approve/dontAsk/plan) and allow/deny rules** — Wave 3.
- **Pre-tool-use hooks** — Wave 3.
- **Read-cache invalidation by fsnotify** — Wave 3.
- **Auto-titling convergence, dry-run diff preview, reasoning redraw atomicity, expanded safe-command whitelist, `runCommand` wrapper peel** — Wave 3.
- **Tool/handler refactors that are not strictly required by this spec.** The split of `src/tools/file-state.js` is the only refactor; the rest of the tool surface is untouched.
- **Changing the `tool_pending` checkpoint format introduced by `specs/2026-08-30-session-resilience`.** This spec only **inspects** the format; it does not modify it.
- **A full security audit of the tool handlers** — the existing threat model in `docs/code-quality-and-security.md` is unchanged. This spec introduces no new attack surface on the tool handlers.
- **Migrating old `.emile/` directories.** New writes are 0600 and per-provider; existing files are re-chmod'd opportunistically but not migrated otherwise.

## 6. Acceptance Criteria

Each AC is independently verifiable. Evidence is recorded in `tasks.md`.

- **AC-01:** Given an active tool call, when the user presses Ctrl+C, then the in-flight tool either completes and its result is persisted, or is replaced with an `aborted` error result via the normal `executeTool` path; the session checkpoint is `complete` or `aborted` (never `pending`); the terminal is left in cooked mode with the cursor visible.
- **AC-02:** Given an idle `emile` process, when SIGTERM is sent, then the process exits within 3 s; the session is flushed; MCP servers receive `shutdown`; the terminal is restored.
- **AC-03:** Given a session with a `pending` checkpoint, when `emile` starts, then `recovery.js` returns a `RecoveryReport` describing the checkpoint as `recoverable`, `abandoned` or `corrupt`; the report is logged in `--verbose`; the REPL is shown regardless of the classification.
- **AC-04:** Given a `recoverable` checkpoint, when the user resumes that session, then the existing `specs/2026-08-30-session-resilience` resume path runs unchanged and no extra tool call is executed by the new modules.
- **AC-05:** Given a malformed or partially-written checkpoint, when `emile` starts, then the session is marked `corrupt`, the bad file is moved to `.emile/sessions/<id>/corrupt/`, and the user is told the session is still listable but not auto-resumed.
- **AC-06:** Given the user runs `/undo` after closing and reopening `emile` in the same workspace, then the previous file modification is reverted exactly.
- **AC-07:** Given a session that performs 60 file modifications, when the 51st is recorded, then the oldest entry is dropped from memory and from `.emile/undo/<sessionId>/`; the cap is enforced.
- **AC-08:** Given the provider is `requesty` and only `OPENROUTER_API_KEY` is set, when `config.resolveApiKey('requesty')` is called, then it returns the empty string and the connect wizard reports the missing key.
- **AC-09:** Given a freshly saved `.emile/config.json`, when the file mode is inspected, then it is `0600` on a POSIX host; on a filesystem that rejects the mode (e.g. FAT), a warning is logged in `--verbose` and the write still succeeds.
- **AC-10:** Given `package.json` after this spec, when `npm install` is run on Node 16, then npm emits an `EBADENGINE` warning.
- **AC-11:** Given every new module, when `wc -l` is run, then no file exceeds 150 lines and no file mixes two responsibilities (verified by an automated check in `test/structure.test.js`).
- **AC-12:** Given `--verbose` is set, when shutdown runs, then each phase logs its name and elapsed milliseconds; when a phase exceeds its slice, the offender is named.

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|---------|--------------------|
| Hooks on `process.on('exit')` are **synchronous-only**. Any async work must be done in the `beforeExit` / signal handlers and re-entrancy must be guarded. | High | The coordinator sets a `shuttingDown` flag on first signal; subsequent signals are no-ops except the final `process.exit`. Each phase is awaited from the signal handler, and `process.on('exit')` only sets the exit code. |
| Persisted undo could grow large. | Medium | Cap of 50 entries and a per-entry size cap of 2 MB (after which the entry is recorded as `content:null, oversized:true` and `/undo` reports the cap). Configurable in a future spec. |
| `chmod 0600` on Windows is a no-op. | Low | Best-effort: if `chmod` throws or is unavailable, the file is still written and a warning is logged. The README already states POSIX is the primary target. |
| `.emile/undo/` symlink traversal. | Medium | `persistence.js` resolves the target with `realpath` and refuses to follow a symlink whose real path escapes `.emile/undo/`. |
| Existing `.emile/config.json` with the wrong mode. | Low | On the next save, the file is re-chmod'd. A one-time migration step is intentionally out of scope; users who upgrade and never save a config keep the old mode until they touch settings. |
| Race between `drain-tools` and a new tool call arriving from the model. | Low | The shutdown coordinator disables the agent's "submit next prompt" path before phase 2. New model output after that point is buffered but not executed. |
| Interaction with `specs/2026-08-30-session-resilience` resume path. | Low | The recovery scan produces a report; it does not call `resumePendingTools`. The existing resume path remains the single owner of tool execution on resume. |

## 8. References

- [`docs/ROBUSTNESS-ROADMAP.md`](../../docs/ROBUSTNESS-ROADMAP.md) — Wave 1 of the program.
- [`IMPROVEMENTS.md`](../../docs/IMPROVEMENTS.md) §§1.4, 1.5, 2.1, 3.3.
- [`docs/code-quality-and-security.md`](../../docs/code-quality-and-security.md) — gates this spec must pass.
- [`docs/architecture.md`](../../docs/architecture.md) §2 — module map; new files follow the documented places.
- [`docs/visual-identity.md`](../../docs/visual-identity.md) §3 — new UI must use the `C` palette.
- [`specs/2026-08-30-session-resilience`](../../specs/2026-08-30-session-resilience) — existing checkpoint format and resume path (unchanged).
- `grok-build/crates/codegen/xai-grok-workspace/src/recovery.rs` — reference for `recovery.js`.
- `grok-build/crates/codegen/xai-grok-workspace/src/session/checkpoint_store.rs` — reference for `tools/file-state/persistence.js`.
- [ADR-0001](../../docs/adr/0001-tech-stack-choice.md), [ADR-0002](../../docs/adr/0002-quality-gates.md) — stack and gates.
