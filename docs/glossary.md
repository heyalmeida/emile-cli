# Emile — Glossary

> emile-cli domain terms. Code, functions and identifiers in English; this glossary is also in English since the project is open source.

| Term | Definition |
|------|-----------|
| **Agent loop** | The core cycle: assemble prompt → call LLM → parse stream → execute tools → feed history, until the model stops requesting tools. Lives in `src/agent.js`. |
| **Turn** | One complete agent-loop iteration: one API call + resulting tools, ending with a final reply to the user. |
| **Tool** | A function exposed to the model (OpenAI function-calling format). Built-in in `src/tools.js` or provided via MCP. |
| **Provider-operated tool** | A tool executed by the active provider rather than by emile's local dispatcher. OpenRouter web search is the current example and is composed only for OpenRouter requests. |
| **Web search** | Optional OpenRouter provider-operated search, enabled with `--web-search` or `/websearch`; it can add provider charges and returns untrusted external data. |
| **Safe mode** | Gate requiring user confirmation before running shell commands outside the whitelist. On by default; `--no-safe` disables it. |
| **Dry-run** | Simulation mode: write and exec tools report what they would do without doing it. |
| **Command whitelist** | List of commands considered safe (read-only) that skip confirmation: `git status/diff/log/show`, `npm test`, `ls`, `dir`, `pwd`. |
| **`resolveSafePath`** | Function confining every file operation to the workspace, blocking path traversal. |
| **Undo stack** | Stack of file modifications made by the agent, powering `/undo`. |
| **Plans mode** | Mode (`-p`) where the agent drafts an implementation plan and waits for approval before writing any file. |
| **Skill** | Knowledge module in YAML frontmatter + markdown (`.agent/skills/`) injected into the system prompt when the user's prompt matches its keywords. |
| **Project rules** | Optional always-on preferences authored by the workspace maintainer in `.emilerules`, with compatible `AGENTS.md`/`.clinerules`/`.cursorrules` fallbacks; inspected read-only via `/rules`. |
| **Keyword matching** | The conditional skill-activation mechanism (`src/skills.js`) so context isn't bloated on every message. |
| **MCP** | Model Context Protocol — protocol exposing external tools to the agent. STDIO, SSE and streamable HTTP transports are configured in `mcp.json`; tools are namespaced `mcp__<server>__<tool>`. |
| **MCP consent** | One-time per-workspace approval required before a new configured MCP server is connected; only the server name is persisted in `.emile/mcp-consent.json`. |
| **MCP reconnect** | Bounded recovery after an unexpected MCP transport close: attempts at 500ms, 1s and 2s, then leaves the server unavailable with a warning. |
| **Prompt caching** | Provider-side reuse of the conversation's stable prefix (Requesty) to cut cost. `--no-cache` disables it. |
| **Reasoning effort** | Model reasoning depth (`-e`): `low`/`medium`/`high`/`max`/`min`/`none`. |
| **Thinking stream** | Live rendering of the model's reasoning during streaming; collapsible via `/thinking`. |
| **Session** | A conversation persisted per workspace in `.emile/`, resumable (`-H`, `/switch`) and exportable (`/export`). |
| **Context tracking** | Real-time token tracking: real API usage (`usage`) with a pre-call estimate as fallback; visible in the footer and in `/cost`. |
| **Context compression** | In-memory summarization of older conversation history when the estimated full payload reaches 80% of the active model's context window; a 40% post-compression growth gate prevents immediate repetition. |
| **Free-model fallback** | If a paid model call fails, the loop falls back to `openrouter/free` (`FREE_FALLBACK_MODEL`). |
| **Workspace** | The user's working directory where emile operates; the confinement root for reads/writes. |
| **Session cwd** | The workspace-contained current working directory carried between `runCommand` calls and persisted with a session; `/new` resets it to the workspace root. |
| **TUI** | Terminal User Interface — emile's terminal interface, governed by `docs/visual-identity.md`. |
| **Terminal title** | Best-effort OSC window/tab title showing Emile's sanitized runtime activity plus workspace/model identity; disabled outside supported TTYs. |
| **Tokyo Night** | Emile's official color palette (defined in `src/ui.js`, exported as `C`). |
| **Spec / Plan / Tasks** | Spec-Driven Development artifacts in `specs/` — the what / how / doing. |
| **Feature registry** | Catalog of delivered features in `features/`, each traceable to its source spec. |
| **ADR** | Architecture Decision Record — versioned record of an architectural decision in `docs/adr/`. |
| **Integration branch** | `development`, the shared parent and integration base from which active domain branches are created and to which reviewed work returns. |
| **Feature branch** | Git branch dedicated to one stable product domain (e.g., `feat/mcp-system`), created from `development` and mandated by Rule 8 of `.clinerules`. |
| **Documentation branch** | `docs/documentation`, the branch dedicated to README, docs, specs, feature registry, CHANGELOG and workflow-rule commits. |
| **Legacy branch archive** | Read-only `archive/legacy/...` refs preserving historical branch tips after an active branch is renamed or retired. |
