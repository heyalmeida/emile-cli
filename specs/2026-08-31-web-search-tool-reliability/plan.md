# Plan: Web search and tool execution reliability

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-31-web-search-tool-reliability` |
| **Status** | `implemented` |

## 1. Technical Approach

1. Add an isolated provider-tool composer that returns the OpenRouter
   `openrouter:web_search` server-tool schema only when `config.webSearch` is
   enabled and the provider is OpenRouter. Pass the same effective tool list
   to context estimation and the agent request.
2. Add `--web-search`, persistent `config.webSearch`, and `/websearch`. Keep
   the default off to avoid surprising search charges; show availability and
   cost caveat when toggled.
3. Track `config.sessionCwd` at runtime. `runCommand` executes from it and
   appends a private shell marker to capture the resulting cwd, strips that
   marker from output, and updates state only for a validated directory inside
   the workspace. Save/restore the validated value in session metadata and
   reset it on `/new`.
4. Expand provider-error classification and route stream errors through the
   same bounded formatter. Derive HTTP status from OpenRouter's nested numeric
   `error.code` when needed, redact key-like values and expose
   status/category, not raw response bodies. Retry transient stream failures
   only before the first chunk to prevent duplicated output.
5. Add explicit argument validation and regression tests for write/edit
   boundary failures while retaining existing path, dry-run and undo gates.

## 2. Architectural Compliance

- **ADR-0001:** no new dependency and no build step; use the existing OpenAI
  compatible client and raw Node APIs.
- Provider-specific schema stays in `src/api/`; agent composition remains in
  `src/agent/`; file/shell controls remain in `src/tools/`; terminal behavior
  remains in `src/ui/` and command handlers.
- Search results remain provider/model context; they are never executed as
  commands or treated as trusted instructions.

## 3. Threat Model and Negative Tests

| Surface | Test/Control |
|---------|--------------|
| Unsupported provider schema | Assert Requesty/OpenCode tool list excludes `openrouter:web_search`. |
| Search cost/availability | Default-off test and toggle test; non-OpenRouter returns a clear warning. |
| Cwd escape | `cd` to workspace child persists; `cd /tmp` does not become the next session cwd. |
| File boundaries | Missing/non-string args, `../` traversal, dry-run and undo remain safe. |
| Provider errors | 402/429/500/stream errors classify without secrets or raw response bodies. |
| Existing execution safety | Unsafe commands still go through confirmation; command timeout/failure becomes tool output. |

## 4. Impacted Modules

| Module | Path | Change |
|--------|------|--------|
| Provider tools | `src/api/provider-tools.js` | OpenRouter web-search schema and provider gating. |
| API errors | `src/api/client.js`, `src/api/index.js` | Bounded status/category formatting and export. |
| Agent loop | `src/agent/agent.js` | Effective provider tool list and actionable stream errors. |
| Configuration/CLI | `src/config.js`, `src/cli.js`, `src/commands/` | Search toggle, session cwd setup/persistence and command. |
| Shell/tool state | `src/tools/handlers/run-command.js`, `src/tools/security.js` | Persistent validated cwd and marker handling. |
| File tools | `src/tools/handlers/write-file.js`, `edit-file.js` | Boundary validation and clear failures. |
| Sessions | `src/history.js` | Persist optional validated cwd metadata. |
| Documentation/tests | `README.md`, `docs/`, `features/`, `CHANGELOG.md`, `test/` | User contract, registry and regression evidence on docs branch. |

## 5. Verification Strategy and Gates

- Run `node --check` for every touched source file, `npm test`, `npm run lint`
  and `git diff --check`.
- Test provider-tool composition without network access.
- Test cwd persistence in a temporary workspace, including an outside-path
  attempt and command failure.
- Test malformed write/edit arguments, traversal, dry-run and undo behavior.
- Run a non-interactive CLI smoke with a simple task where configured MCP
  connectivity permits it; record external MCP/network limitations rather
  than weakening gates.

## 6. Git Workflow

| Item | Answer |
|--------|--------|
| **Feature branch** | `feat/model-system` for provider/search and agent contract; `feat/tools-system` would be separate for unrelated future tool work. |
| **Documentation branch** | `docs/documentation` |
| **Commit plan** | Product source/tests on `feat/model-system`; spec, docs, feature registry and CHANGELOG on `docs/documentation`. |
