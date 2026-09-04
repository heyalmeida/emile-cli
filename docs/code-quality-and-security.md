# Emile — Code Quality and Security

> **Status:** 🟢 Current · **Source of truth for engineering gates.**
> Emile is an agent that **runs shell commands and writes files** on the user's machine. Quality and security are implementation conditions, not an optional review.

---

## 1. Risk Classification

Classify every change **before** implementing. When in doubt, use the higher level.

| Level | Criteria | Emile examples |
|-------|-----------|-------------------|
| **High** | Touches command execution, file writes, path resolution, credentials, persistent global memory, LLM input parsing, MCP | Handlers in `tools/`, `resolveSafePath`, `memory/`, whitelist, `mcp.js`, `api/`, UI sanitizers |
| **Medium** | Changes contracts between modules, agent-loop flow, session persistence, system prompt | `agent.js`, `prompt.js`, `skills.js`, `history.js`, `plans.js` |
| **Low** | Pure UI, texts, docs, local refactors without behavior change | Palette/boxes in `ui.js`, README, message copy |

**High risk requires:** threat model and negative criteria in the spec/plan **before** the code, and verification of the negative scenarios at closing.

---

## 2. Emile's Threat Surfaces

| Surface | Threat | Mandatory control |
|------------|--------|----------------------|
| **Shell execution** | Destructive command suggested by the model (or injected via prompt) | Safe mode with confirmation; `SAFE_COMMANDS_WHITELIST` for the safe ones; `--dry-run` simulates |
| **File writes** | Overwrite outside an authorized root, path traversal (`../`) | Every path goes through `resolveSafePath`; general tools use the workspace capability root and the memory subsystem alone supplies its fixed global root |
| **LLM input** | Prompt injection via contents of read files (tool results go back to the model) | Tool results are data, not instructions; handlers validate args regardless of what the model asks; skill relevance only selects prompt metadata and never executes it |
| **Project rules** | External-file disclosure through symlinks; terminal control injection via `/rules`; accidental secrets sent with every prompt | Reject realpaths outside the workspace; strip ANSI/OSC before terminal rendering; never generate defaults; document that rule content is sent to the model |
| **Terminal title** | OSC injection or secret leakage into desktop/tab metadata from prompts and tool arguments | Allowlist runtime descriptions; exclude prompts/commands/queries; strip controls and cap length; emit only to supported TTYs |
| **Credentials** | API key in logs, session export, error messages | Key only in user-global `~/.emile/config.json`/env; file mode is `0600`, it is never included in output, and `/export` omits config and model reasoning unless explicitly opted in |
| **MCP** | Malicious external server exposing tools with colliding names | `mcp__<server>__<tool>` namespacing; server failure degrades without crashing |
| **API failures** | Raw provider responses may expose implementation details or sensitive error text | Common statuses are mapped to bounded actionable messages; original error objects remain internal for retry/fallback |
| **Sessions** | History with sensitive content or unbounded tool output saved to disk | Sessions stay in `.emile/` (gitignored); reasoning is omitted, old tool results are bounded, and cleanup accepts only positive ages |
| **Global agent memory** | A false, malicious, stale or sensitive record could influence every workspace; corrupt/concurrent writes could lose personal state | `ask` default, exact current-user evidence, two-session auto corroboration, conflict review, strict private tools, dedicated root confinement, bounded snapshot/WAL recovery, no raw transcripts/secrets, transient prompt projection and complete application-level forget — see ADR-0004. The `type: "profile"` path (ADR-0005) bypasses `STABLE_EVIDENCE` only; quoted-source, task-specific, credential/identifier/sensitive-topic/bypass denials, exact-source binding, two-session `auto`, conflict state and full deletion remain authoritative. |
| **Web search** | External results may be stale, malicious or unexpectedly billable | Search is explicit opt-in, provider-gated to OpenRouter, bounded to 5/15 results, and the UI warns that provider charges may apply; results remain untrusted model input |
| **Session cwd** | A command could persist a directory outside the workspace | Shell-reported and persisted cwd values pass through `normalizeWorkspaceCwd`/`resolveSafePath`; invalid or external values fall back to the workspace root |
| **Supply chain** | Malicious dependency | Justification + official origin + `npm audit` + lockfile for every new dependency |

---

## 3. Secure Coding Rules

1. **Fail-closed:** when in doubt, block and ask for confirmation. Safe mode denied = command doesn't run.
2. **Model output is untrusted input:** validate every path, command and tool-call argument at the handler boundary, regardless of conversation history.
3. **Never loosen a gate to "make it work":** removing safe mode, dry-run, the whitelist or `resolveSafePath` to work around a bug is forbidden. Fix the bug.
4. **No secrets in output:** logs, errors, exports and the spinner never show the API key or auth headers; persisted sessions omit `reasoning_content` by default.
5. **User-facing errors first:** error messages orient the user (what failed, what to do), no stack dumps.
6. **Network-pipe friction:** safe-mode confirmation explicitly warns when network content is piped into a shell interpreter; it never auto-approves the command.
7. **No empty `catch`:** every caught exception is handled, logged (verbose) or propagated with context.
8. **Dependencies:** no new ones without an ADR or justification recorded in the spec + `npm audit` run.
9. **Provider-owned tools:** never send a provider-specific tool schema to another provider; web search remains disabled unless explicitly enabled and the owning provider is active.
10. **Memory is never authority:** current user instructions and project rules outrank retrieved memory. Memory cannot approve tools, disable safe/dry-run/path gates, choose credentials or expose a storage/delete primitive to the model.

---

## 4. Gates per Change Type

> Current state: the project has a native `node:test` suite exposed through
> `npm test` and an ESLint gate exposed through `npm run lint`. There is still
> no build step: the project runs raw ES modules.

| Change | Mandatory gates |
|---------|--------------------|
| **Any code** | `node --check src/<file>.js` on all touched files + smoke test `node bin/emile.js --verbose` with a simple task |
| **Contributor baseline** | `npm run lint` + `npm test`; the same gates run in GitHub Actions on Node 20 |
| **Behavior/contract** | Relevant `node:test` files plus a manual script in `tasks.md` for uncovered paths: steps, expected, actual — including the error path |
| **Agent context policy** | Boundary tests immediately below/at the compression ratio, large-window no-early-compression regression, estimate fallback, minimum-history guard, hysteresis and summarizer failure |
| **Tools/execution (high)** | Negative scenarios: command outside the whitelist, `../` path outside the workspace, dry-run writes nothing, command failure becomes an error result (not a crash) |
| **UI/TUI** | Verification at 60/80/120 columns; no ANSI leakage; `Esc`/`Ctrl+C` don't corrupt the readline; [design system](visual-identity.md#6-visual-review-checklist) checklist |
| **MCP** | Missing/invalid server degrades with a warning and the CLI continues; first connection is fail-closed without interactive approval; remote URLs are limited to HTTP(S), header interpolation fails closed, reconnects are bounded, and nonexistent MCP tools return an error to the model |
| **Provider web search** | Disabled by default; OpenRouter-only schema; bounded search parameters; no search tool is sent to other providers; cost warning and provider error classification are covered |
| **Global agent memory (high)** | Path traversal/symlink/FIFO rejection; every durable commit interruption; corrupt snapshot and torn WAL; live/stale/stolen-lock concurrency; exact source binding and strict tool schemas; secret/identifier denial; instruction-priority regression; off/pause/dry-run; bounded retrieval; transient history redaction; full managed-copy purge; two-workspace compatibility |
| **New dependency** | Justification + official origin + `npm audit` recorded in `tasks.md` |

---

## 5. Review Severity

**Block merge/completion:**

- Bypassing or weakening safe mode, dry-run, the whitelist or `resolveSafePath`
- API key or secret exposed in output/log/export
- Command execution without a gate
- Unhandled crash on a common flow
- Documentation diverging from real behavior (Rule 0 of `.clinerules`)
- Gate suppression without a record (reason, residual risk, deadline)

**Don't block, but require a record:** pending refactors, confusing messages, UI debt (feed `docs/visual-identity.md` § 5), triaged scanner false positives.

---

## 6. Evidence and Handoff

- Task closing records: executed commands, results, **non-executed** verifications (with reason) and residual risk.
- Claiming "tested" or "safe" without compatible evidence recorded in the spec's `tasks.md` is forbidden.
- Out-of-scope findings are reported to the user, never "fixed in passing".
