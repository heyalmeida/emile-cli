# Emile — Robustez & Hardening Roadmap

> **Status:** 🟡 Proposed · **Source of truth for the post-grok robustness program.**
> Three waves of hardening derived from a side-by-side review of `grok-build/`
> (reference) and `emile-cli` (target). Each wave ships as its own SDD spec on
> a dedicated `feat/...` branch, with measured acceptance criteria and a
> recorded verification log. Nothing here is implemented yet — this document
> is the **plan of attack**; the specs (`specs/YYYY-XX-name/`) are the
> implementation contracts.

---

## 0. Reading order

| Doc | Why read it |
|-----|-------------|
| [`IMPROVEMENTS.md`](IMPROVEMENTS.md) | The "small backlog" that already lives in the repo. Items 1.4, 1.5, 2.1, 3.3 are still open and are folded into Wave 1. |
| [`roadmap.md`](roadmap.md) | The current phase map. This document lives **inside** Phase 3 (Agent Robustness) and partially overlaps Phase 4 (Distribution). |
| [`code-quality-and-security.md`](code-quality-and-security.md) | The gates every wave must pass (lint + test + smoke + spec-evidence). |
| [`architecture.md`](architecture.md) | Module map — new files go in the documented places. |
| `grok-build/crates/codegen/xai-grok-workspace/src/recovery.rs` | Reference for Wave 1's startup-recovery scan. |
| `grok-build/crates/codegen/xai-grok-tools/src/retry.rs` | Reference for Wave 2's backoff utility. |
| `grok-build/crates/common/xai-circuit-breaker/` | Reference for Wave 2's circuit breaker. |
| `grok-build/crates/codegen/xai-grok-pager/docs/user-guide/22-permissions-and-safety.md` | Reference for Wave 3's permission modes. |

---

## 1. Why this document exists

`docs/roadmap.md` describes **what** the project is becoming. `IMPROVEMENTS.md`
describes a flat backlog of code-quality nits. Neither captures the **specific
gaps in robustness** that appear when you compare emile-cli to a production
agent like grok-build.

This document is the missing middle layer:

- It classifies 16 concrete **gaps** observed in the current `src/`.
- It borrows 13 **patterns** from grok-build that translate cleanly to
  Node.js + ESM (and explicitly rejects the ones that don't: Landlock,
  Seatbelt, ACP JSON-RPC, in-tree SQLite, Rust sandbox).
- It sequences the resulting work into 3 waves, each bounded by its own SDD
  spec, each closing the loop with `npm test`, lint, smoke and CHANGELOG.
- It defers anything that is **scope creep** (ACP, background `/loop`,
  worktrees, plugins marketplace) to a separate, post-program backlog so this
  program stays shippable.

**Goal of the program:** zero unhandled crashes on common coding tasks;
predictable session/state behavior across restart; safe-mode and permission
gates that hold even under degraded network.

---

## 2. Reference patterns from `grok-build/`

The patterns below are the concrete, code-level lessons extracted from grok.
Each one names the source file in grok and the destination in emile.

| # | Pattern (grok) | Source | Destination | Notes |
|---|----------------|--------|-------------|-------|
| G1 | Startup recovery scan with sha256-verified sidecars | `crates/codegen/xai-grok-workspace/src/recovery.rs` | `src/history.js` + new `src/recovery.js` | Verify every `pending` checkpoint before declaring "ready"; drop corrupt ones with a labeled metric, never propagate failures to startup. |
| G2 | Structured `BackoffConfig` + `execute_with_backoff` | `crates/codegen/xai-grok-tools/src/retry.rs` | new `src/retry.js` | Replaces the inline `attempt * 1500` math in `src/api/client.js`. Honors `Retry-After` and surfaces attempt counts to the UI. |
| G3 | Circuit breaker (Closed / HalfOpen / Open) with sliding window | `crates/common/xai-circuit-breaker/` | new `src/circuit-breaker.js` | Trips after a configurable consecutive-failure threshold, half-opens after a cool-down, fails fast while open. |
| G4 | fsnotify adapter forwarding to hunk tracker / codebase graph | `crates/codegen/xai-grok-workspace/src/fs_notify.rs` | new `src/fs-watcher.js` | Invalidates the `file-state.js` read cache on `Modified` and registers changes in the context counter. |
| G5 | `/compact [note]` + plan-mode preservation across compaction | `crates/codegen/xai-grok-compaction/` | extend `src/agent/compression.js` | Accept an optional preservation note from the user; preserve plan-mode flag and current task file across the compaction. |
| G6 | Pre-tool-use hooks with trust model | `docs/user-guide/10-hooks.md` + `crates/codegen/xai-grok-hooks/` | new `src/tools/hooks.js` | Scripts/JS hooks in `.emile/hooks/`, trust persisted in `.emile/trusted-hooks.json`, gate before the existing security check. |
| G7 | Persistent undo (worktree-style checkpoint store) | `crates/codegen/xai-grok-workspace/src/session/checkpoint_store.rs` | extend `src/tools/file-state.js` | Mirror the in-memory undo stack to `.emile/undo/` with a cap of 50 entries; restore works after restart. |
| G8 | MCP tools-list snapshot at consent; re-validate on reconnect | `crates/codegen/xai-grok-mcp/src/owned_clients.rs` + `servers.rs` | extend `src/mcp.js` | Persist a `toolsHash` alongside the approved server name; on reconnect, re-fetch and re-prompt when the hash differs. |
| G9 | Ordered async shutdown coordinator | (pager shutdown sequence, implicit) | new `src/lifecycle.js` | Phase order: stop input → drain tool calls → flush session → close MCP → reset readline → exit. Global3s timeout, fail-loud in verbose mode. |
| G10 | Granular permission modes (`default | auto | always-approve | dontAsk | plan`) + allow/deny rules | `docs/user-guide/22-permissions-and-safety.md` | new `src/permissions.js` + `src/config.js` extension | Largest scope item of the program. See §5 for the **minimum vs. full** decision. |
| G11 | Auto-titling of sessions (regenerate at turns 1/3/7, freeze after) | `docs/user-guide/17-sessions.md` + `crates/codegen/xai-grok-pager/src/sessions_cmd.rs` | extend `src/agent/session-summary.js` | Manual `/rename` always wins; `/rename --auto` releases. |
| G12 | `engines: { node: ">=18" }` (still open from `IMPROVEMENTS.md` §3.3) | `package.json` | `package.json` | Trivial, folded into Wave 1. |
| G13 | Expanded safe-command whitelist (still open from `IMPROVEMENTS.md` §2.2) | `src/tools/security.js` | `src/tools/security.js` | Folded into Wave 3 alongside the permission system rework. |

**Patterns consciously NOT ported** (and the reason):

| Pattern | Reason |
|---------|--------|
| Landlock / Seatbelt kernel sandbox | No mature Node.js equivalent; emile's `resolveSafePath` + safe-mode is the realistic boundary for a CLI today. A future spec could add a `bubblewrap` invocation as an optional layer. |
| ACP JSON-RPC server / stdio mode | Out of scope for the hardening program. Tracked separately as a future capability (see §6). |
| SQLite FTS5 session search | emile's JSONL-per-session model is intentional (transparent, git-friendly). A future spec may add an opt-in SQLite index. |
| Git worktree-per-session | Heavy lift that changes the session model; out of scope. |
| Marketplace / plugin distribution | Distribution-phase work, tracked in `roadmap.md` Phase 4. |
| Image/video generation, voice | Product features unrelated to robustness. |

---

## 3. Gap inventory (current state of `src/`)

Confirmed by reading the modules listed in `docs/architecture.md`. Each gap
points to the file and the relevant function/section.

| # | Gap | File / function | Risk | Closed by |
|---|-----|------------------|------|-----------|
| L1 | Graceful shutdown is not guaranteed — MCP, readline and session write are not drained in any exit path (Ctrl+C, SIGTERM, unhandled rejection). | `src/cli.js`, `src/mcp.js`, `src/ui/prompt-input-persistent.js`, `src/history.js` | **High** | G9 (Wave 1) |
| L2 | No startup recovery of `pending` checkpoints — a session interrupted mid-tool is resumed manually. | `src/history.js` | **High** | G1 (Wave 1) |
| L3 | Retry classifier misses `ETIMEDOUT`, `ECONNRESET`, TLS resets — only HTTP status codes are mapped. | `src/api/client.js` (`isRetryable`) | **Medium** | G2 (Wave 2) |
| L4 | `saveUserConfig` does not enforce `0600`; cross-provider API key fallback hides misconfiguration. | `src/config.js` | **High (security)** | Wave 1 (closes `IMPROVEMENTS.md` §1.4 + §2.1) |
| L5 | Compaction is automatic only — no `/compact <note>`, no explicit preservation of plan-mode state. | `src/agent/compression.js` | **Medium** | G5 (Wave 2) |
| L6 | No pre-tool-use hooks — safe-mode is a binary gate. | `src/tools/security.js` | **Medium** | G6 (Wave 3) |
| L7 | Undo stack lives only in memory; restart wipes it. | `src/tools/file-state.js` | **Medium** | G7 (Wave 1) |
| L8 | No circuit breaker — sustained provider failure keeps hammering. | `src/api/client.js` | **Medium** | G3 (Wave 2) |
| L9 | `editFile` ambiguity is rejected but the model doesn't see a **dry-run diff** preview before approval. | `src/tools/handlers/edit.js` + `src/tools/show-diff.js` | **Low** | Wave 3 |
| L10 | Reasoning redraws can interleave with tool lines on slow terminals. | `src/ui/thinking.js`, `src/ui/turn-keys.js` | **Low** | Wave 3 |
| L11 | No ACP / Agent Client Protocol — no IDE integration surface. | (absent) | Capability, deferred | §6 |
| L12 | MCP consent records only the server name; a malicious tool-list update goes undetected. | `src/mcp.js` | **Medium (security)** | G8 (Wave 2) |
| L13 | No background tasks / `/loop <interval>`. | (absent) | Capability, deferred | §6 |
| L14 | Auto-titling runs only once, then freezes — doesn't converge on the real topic. | `src/agent/session-summary.js` | **Low** | G11 (Wave 3) |
| L15 | Test coverage of recovery / shutdown / hooks / circuit-breaker is absent (unit suite exists but doesn't touch these). | `test/` | **Medium** | Each wave's spec records its own test plan |
| L16 | `runCommand` doesn't peel wrappers (`timeout`, `env`) before rule matching. | `src/tools/handlers/exec.js` | **Low** | Wave 3 |

---

## 4. The three waves

Each wave is **one SDD spec** with its own `spec.md` / `plan.md` / `tasks.md`,
its own `feat/...` branch off `development`, its own test plan, and its own
CHANGELOG entry. Every wave ends with documentation sync (Rule 2 of
`AGENTS.md`) and an evidence section in `tasks.md`.

### Wave 1 — Session resilience (closes `IMPROVEMENTS.md` §1.4, §1.5, §2.1, §3.3)

> Theme: **the program never corrupts state, never loses undo, never leaks handles.**

| Theme | Pattern | New / changed files | Acceptance (recorded in `tasks.md`) |
|-------|---------|---------------------|-------------------------------------|
| Ordered shutdown | G9 | new `src/lifecycle.js`; edits in `src/cli.js`, `src/mcp.js`, `src/history.js`, `src/ui/prompt-input-persistent.js` | A Ctrl+C during an active tool call completes the in-flight tool or marks its checkpoint as `aborted`; MCP servers receive `shutdown`; the last session write hits disk. A SIGTERM in idle state exits cleanly. |
| Startup recovery | G1 | new `src/recovery.js`; edits in `src/history.js` | Resuming a session with a `pending` checkpoint either re-queues the tool (if recoverable) or surfaces the abandoned tool to the user with a labeled metric in verbose mode. |
| Persistent undo | G7 | edits in `src/tools/file-state.js`; new `.emile/undo/` schema | `/undo` after `emile` restart restores the file exactly; cap of50 entries is enforced; cap-overflow is logged. |
| Cross-provider key isolation | (`IMPROVEMENTS.md` §1.4) | `src/config.js` | Saving a `requesty` provider does not silently pick up an `OPENROUTER_API_KEY`; mismatched keys are surfaced in the connect wizard. |
| `0600` on config file | (`IMPROVEMENTS.md` §2.1) | `src/config.js` | `saveUserConfig` writes with `mode: 0o600`; existing `.emile/config.json` is `chmod 0600`'d on next save. |
| `engines` field | G12 | `package.json` | `npm install` warns on Node < 18; README still requires Node >= 18. |

**Branch:** `feat/session-resilience`
**Estimated effort:** ~1 week of focused work.
**Risk class:** High — touches every exit path.

### Wave 2 — Runtime resilience

> Theme: **transient provider and MCP failures don't derail a turn.**

| Theme | Pattern | New / changed files | Acceptance |
|-------|---------|---------------------|------------|
| Structured backoff with `Retry-After` honoring | G2 | new `src/retry.js`; edits in `src/api/client.js` | All retryable errors (HTTP 429/502/503/504, ETIMEDOUT, ECONNRESET, TLS reset) retry with the right delay; the user sees attempt N/M in the spinner. |
| Circuit breaker | G3 | new `src/circuit-breaker.js`; wired into `src/api/client.js` | After 5 consecutive failures within30s, requests fail fast for30s; after the cool-down a single probe is allowed; successful probe closes the breaker. |
| `/compact [note]` + plan-mode preservation | G5 | `src/agent/compression.js`, `src/commands/handlers.js` | A user-issued `/compact keep auth flow` injects the note into the summarizer prompt; running compaction while in plan mode preserves the plan-mode flag and the current task list. |
| MCP consent re-validation | G8 | `src/mcp.js`, `.emile/mcp-consent.json` schema bump | If the tool list advertised by an approved server changes, the user is re-prompted before any of the new tools can be called. |

**Branch:** `feat/runtime-resilience`
**Estimated effort:** ~1 week.
**Risk class:** Medium — adds two new modules and rewires the API client.

### Wave 3 — Permission hooks & polish

> Theme: **the user can express policy that survives across sessions; UX paper-cuts are closed.**

| Theme | Pattern | New / changed files | Acceptance |
|-------|---------|---------------------|------------|
| Pre-tool-use hooks | G6 | new `src/tools/hooks.js`, `.emile/trusted-hooks.json` schema | A hook script returning `{"decision":"deny","reason":"…"}` blocks the tool before the security gate; untrusted project hooks prompt for trust before they run; hook crash is surfaced in the UI without executing the tool. |
| Permission modes | G10 (minimum) | new `src/permissions.js`; edits in `src/config.js`, `src/tools/security.js`, `src/commands/handlers.js` | `--permission-mode {default,auto,always-approve,dontAsk,plan}` flag works; `/settings` exposes a mode picker; `allow`/`deny` rules in `.emile/config.toml` are evaluated in `deny > ask > allow` order; a `deny` rule wins even under always-approve. |
| Auto-titling convergence | G11 | `src/agent/session-summary.js` | A fresh session regenerates its title at turns 1, 3 and 7; a manual `/rename` is preserved thereafter; `/rename --auto` releases the title back to automatic generation. |
| Read-cache invalidation via fsnotify | G4 | new `src/fs-watcher.js`; edits in `src/tools/file-state.js` | Editing a file outside the agent (e.g., `vim`) invalidates the read cache within 1s; the next `readFile` re-reads from disk. |
| Dry-run diff preview | L9 | `src/tools/handlers/edit.js`, `src/ui/diff-block.js` | `editFile` returns the diff even when it succeeds; in `--dry-run` mode no write occurs but the diff is rendered. |
| Reasoning redraw atomicity | L10 | `src/ui/thinking.js`, `src/ui/turn-keys.js` | A thinking block redraws in a single terminal write per chunk; no interleaved tool lines on slow terminals (verified manually at 60/80/120 cols). |
| Expanded safe whitelist | G13 | `src/tools/security.js` | Adds `node --version`, `npm --version`, `cat`, `head`, `tail`, `wc`, `which`, `echo`, `git branch`, `git status <path>` (closes `IMPROVEMENTS.md` §2.2). |
| `runCommand` wrapper peel | L16 | `src/tools/handlers/exec.js` | A rule like `Bash(npm test *)` matches `RUST_LOG=debug timeout 30 npm test --workers=4` (peeling `RUST_LOG=` and `timeout`). |

**Branch:** `feat/permission-hooks-polish`
**Estimated effort:** ~1 week, plus a separate decision checkpoint before the permission-mode rework (see §5).
**Risk class:** Medium for hooks/auto-titling/fsnotify; **High** for the permission-mode rework.

---

## 5. Open decisions before Wave 3

These three questions decide the shape of the largest item in Wave 3 and
must be answered before `spec.md` is written for that wave.

| # | Question | Options | Default if no answer |
|---|----------|---------|----------------------|
| D1 | **Permission-modes scope**: minimum or full port from grok? | **(a)** minimum: 3 current modes + hooks only · **(b)** full: 5 modes + allow/deny rules in `.emile/config.toml` | **(a) minimum** — the full port doubles the test surface and requires a config migration. |
| D2 | **ACP / Agent Client Protocol**: in scope or out? | **(a)** track as a deferred capability only · **(b)** add a minimal stdio JSON-RPC surface in Wave 3 | **(a) deferred** — current emile is REPL-first; ACP is a separate program. |
| D3 | **Background `/loop`**: in scope or out? | **(a)** out of scope · **(b)** include as a minimal scheduler in Wave 3 | **(a) out** — not on the robustness critical path. |

Wave 3's spec is blocked until D1 is answered; D2 and D3 only affect the
backlog section (§6).

---

## 6. Deferred backlog (post-program)

Items intentionally excluded from the three waves but worth recording so they
don't get lost. None of them block the program.

| # | Item | Why deferred |
|---|------|--------------|
| B1 | ACP / Agent Client Protocol (JSON-RPC stdio + serve) | Different scope; opens the door to IDE plugins. Best handled as its own program after robustness is green. |
| B2 | Background tasks / `/loop <interval>` | Scheduling semantics deserve their own spec. |
| B3 | SQLite FTS5 session search (`grok sessions search`) | emile's JSONL model is a deliberate choice; an opt-in index can be added later. |
| B4 | Git-worktree-per-session isolation | Changes the session model fundamentally. |
| B5 | Plugin / marketplace distribution | Already tracked in `roadmap.md` Phase 4. |
| B6 | OS-level sandbox via `bubblewrap` / `sandbox-exec` | No mature Node story; document the gap, defer until the ecosystem catches up. |
| B7 | Image / video generation, voice | Unrelated to robustness. |
| B8 | Sub-agent Dashboard (`/dashboard`) | Multi-session UI is its own program. |

---

## 7. Program-level gates (apply to every wave)

These come from `docs/code-quality-and-security.md` and are non-negotiable.

- **Spec-first:** no code merged without `specs/YYYY-XX-name/{spec,plan,tasks}.md`
  approved (Rule 3 of `AGENTS.md`).
- **Branch hygiene:** one `feat/...` branch per wave, scoped commits only,
  no `git add .` (Rule 8 of `AGENTS.md`).
- **Quality gates:** `node --check` on every touched file, `npm run lint`,
  `npm test`, manual smoke test `node bin/emile.js --verbose` with a simple
  task — every gate recorded in `tasks.md` with actual output.
- **Behavior changes:** a documented manual script in `tasks.md` for the
  happy path and at least one error path.
- **Security gates:** no weakening of safe-mode, dry-run, whitelist or
  `resolveSafePath`; no secrets in logs, exports or error messages.
- **Docs sync:** every closed wave updates `CHANGELOG.md`, the relevant
  `docs/*.md`, and adds an entry to `features/` (Rule 2 of `AGENTS.md`).
- **No silent regressions:** if a wave closes a previously-passing test, the
  failure is recorded in the wave's `tasks.md` with file/line/impact, not
  silenced.

---

## 8. Suggested execution order

The waves are sequenced so that later waves can rely on the shutdown
coordinator (Wave 1) and the retry/circuit-breaker layer (Wave 2). Wave 3
has a decision gate before its spec is written.

| Order | Wave | Branch | Blocks |
|-------|------|--------|--------|
| 1 | Wave 1 — Session resilience | `feat/session-resilience` from `development` | Nothing — start here |
| 2 | Wave 2 — Runtime resilience | `feat/runtime-resilience` from `development` | May assume Wave 1 is merged (lifecycle shutdown used by retry to abort a turn) |
| 3 | Wave 3 — Permission hooks & polish | `feat/permission-hooks-polish` from `development` | **Blocked until D1 is decided**; may assume Wave 1+2 are merged |

Each wave ends with a merge to `development` and a CHANGELOG entry under
`[Unreleased]`.

---

## 9. Status snapshot

| Wave | Spec status | Branch | Merged |
|------|-------------|--------|--------|
| Wave 1 — Session resilience | ⬜ not started | — | — |
| Wave 2 — Runtime resilience | ⬜ not started | — | — |
| Wave 3 — Permission hooks & polish | ⬜ blocked on D1 | — | — |
| Deferred backlog (§6) | ⬜ tracked, not scheduled | — | — |

When the program starts, each row becomes a link to its `specs/.../spec.md`
and its `feat/...` branch.

---

## 10. Related

- [`IMPROVEMENTS.md`](IMPROVEMENTS.md) — small code-quality backlog
  (overlaps Wave 1 in §1.4, §1.5, §2.1, §3.3 and Wave 3 in §2.2).
- [`roadmap.md`](roadmap.md) — phase map; this program lives inside Phase 3.
- [`docs/architecture.md`](architecture.md) — module map; new files go in
  documented places only.
- [`docs/code-quality-and-security.md`](code-quality-and-security.md) — gates
  every wave must pass.
- [`specs/README.md`](../specs/README.md) — SDD workflow each wave follows.

> Begin integration by writing `specs/<YYYY-MM-DD>-session-resilience/{spec,plan,tasks}.md`
> for Wave 1, then creating the `feat/session-resilience` branch.