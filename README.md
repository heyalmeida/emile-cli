<div align="center">

# emile

**A terminal-based AI coding agent that lives in your workspace.**

Connects to any OpenAI-compatible LLM provider (Requesty, OpenRouter, OpenCode) with built-in tools, MCP integration, prompt caching, reasoning control, and a Claude Code–style streaming UI.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-green.svg)](https://nodejs.org)

</div>

---

## What is this?

`emile` is a coding agent you run from your terminal. You give it a task in plain, and it reads files, writes code, runs commands, and iterates — all within your current working directory. Think of it as a pair-programmer that never gets tired of refactoring.

It's built to be **provider-agnostic**: it talks to any OpenAI-compatible API, so you're not locked into a single vendor. The agent loop supports tool calls, reasoning models (with live thinking streams), prompt caching to cut costs, and a skills system that injects domain expertise into the system prompt on demand.

This is a personal project that grew into something useful enough to share. It's opinionated, lightweight (one dependency tree, no native modules), and designed to feel fast in the terminal.

---

## Features

- **Live reasoning streams** — watch the model think in real time before it writes code, with expand/collapse toggle
- **Built-in file tools** — read, write, edit (diff-based), search, and run shell commands, all with safe-mode gating
- **MCP integration** — connect external tool servers via Model Context Protocol (STDIO transport)
- **Prompt caching** — Requesty provider supports cache headers to reduce cost on repeated context
- **Reasoning effort control** — dial reasoning depth from `low` to `max` per session or per run
- **Plans mode** — agent drafts an implementation plan and waits for your approval before touching files
- **Skills system** — 40+ YAML-based skill modules (architecture, TDD, React patterns, security, etc.) that auto-inject into the system prompt when relevant
- **User-authored project rules** — optional `.emilerules` preferences, with compatible `AGENTS.md`/`.clinerules`/`.cursorrules` fallbacks
- **Session persistence** — conversations are saved per workspace; resume, switch, export to Markdown, or rewind to edit your last message
- **Opt-in web search** — OpenRouter's provider-operated web search can be enabled per run or with `/websearch`; search charges may apply even on free model routes
- **Context tracking and adaptive compression** — real token usage in the footer; history compresses at 80% of the active model's catalog window
- **Claude Code–style UI** — boxed writing field, autocomplete for slash commands, `Esc` to cancel a draft, Tokyo Night color palette throughout
- **Dynamic terminal title** — the tab reports real activity such as thinking, responding, context compression and safe tool summaries
- **Zero-dependency spinner** — custom Braille spinner with no external animation library

---

## Quick start

### Prerequisites

- [Node.js](https://nodejs.org) >= 18 (uses native ES modules and `fetch`)
- An API key for a supported provider (see [Configuration](#configuration))

### Install

```bash
git clone https://github.com/mc33p/emile-cli.git
cd emile-cli
npm install
npm link   # makes `emile` available globally
```

Or run it directly without linking:

```bash
node bin/emile.js
```

### Configure

On first run, `emile` will walk you through a setup wizard to pick a provider and enter your API key. You can also pre-configure via environment variables:

```bash
export EMILE_PROVIDER=requesty
export REQUESTY_API_KEY=your-key-here
export EMILE_DEFAULT_MODEL=anthropic/claude-3.5-sonnet
export EMILE_DEFAULT_EFFORT=low
export EMILE_WEB_SEARCH=false   # set true only when OpenRouter search is wanted
```

### Run

```bash
emile                              # start interactive REPL
emile "Add input validation to src/api.js"
emile -m openai/gpt-4o -e high "Refactor the auth module"
emile -p "Build a REST API for a todo app"   # plans mode
emile -H                          # resume a previous session

---

## CLI reference

| Flag | Description | Default |
|------|-------------|---------|
| `-m, --model <model>` | Model ID (provider-prefixed, e.g. `anthropic/claude-3.5-sonnet`) | `anthropic/claude-3.5-sonnet` |
| `-e, --effort <level>` | Reasoning effort: `low`, `medium`, `high`, `max`, `min`, `none` | `low` |
| `-p, --plans` | Enable plans mode (agent drafts a plan before executing) | `false` |
| `--no-cache` | Bypass prompt caching | caching on |
| `-s, --skills <list>` | Comma-separated skills to activate (default: auto-detected and task-relevant) | `all` |
| `-H, --history` | Select and resume a past session | `false` |
| `--no-safe` | Bypass the safe-execution gate for shell commands | safe mode on |
| `--dry-run` | Simulate file changes and command execution without writing | `false` |
| `--web-search` | Enable OpenRouter web search; additional provider charges may apply | `false` |
| `--export-thinking` | Include model reasoning in `/export` output (explicit opt-in) | `false` |
| `--max-session-size <bytes>` | Maximum size of each persisted session snapshot; old tool results are trimmed when needed | `10485760` |
| `--max-loop-iterations <n>` | Maximum agent tool-loop iterations per turn (safety cap) | `40` |
| `--verbose` | Show setup and MCP initialization logs | `false` |

---

## Slash commands

Inside the interactive REPL, type `/` to see autocomplete. Available commands:

| Command | Description |
|---------|-------------|
| `/connect` | Reconfigure API provider and key |
| `/model` | Search and switch the active model; type to filter or use ↑/↓ to scroll the full live list |
| `/switch` `/sessions` | Resume a previous session |
| `/sessions clean <days>` | Delete saved sessions older than the specified number of days |
| `/new` `/clear` | Start a fresh session |
| `/rewind` | Remove your last message (and the agent's reply) and re-edit it |
| `/undo [N]` | Revert the last file modification, or the last N changes after confirmation |
| `/cost` | Show cumulative token usage and estimated cost |
| `/export [--export-thinking]` | Export the current session as Markdown; include reasoning only with explicit opt-in |
| `/rules` | Inspect the active user-authored project rules source |
| `/thinking` | Toggle reasoning visibility (expanded by default; collapsed shows a ghost one-liner) |
| `/maxloop <n>` | Set the agent tool-loop iteration cap (default `40`); persists in `~/.emile/config.json` |
| `/websearch` | Toggle OpenRouter provider web search; warns about possible additional charges |
| `/help` | Show the in-app command reference |
| `exit` | Quit the CLI |

**Keyboard shortcuts in the prompt:**

| Key | Action |
|-----|--------|
| `Tab` | Accept autocomplete suggestion / toggle plans mode |
| `Up` `Down` | Navigate autocomplete entries |
| `Shift+Enter` | Insert a newline without sending the prompt |
| `Esc` | Clear the current draft without sending |
| `Ctrl+C` | Exit immediately |
| Paste | Keep the complete pasted text, including multiple lines, editable; press `Enter` separately to send it |

**While the agent is working** the same full prompt remains visible and writable: spinner, reasoning and response output stay above it, while the blinking cursor remains at the active draft. `Tab` completes slash commands, `Esc` or `Ctrl+C` cancel the current turn without closing the CLI, and text confirmed with `Enter` is queued for the next turn. Queued `/` lines run as slash commands between turns.

**While the agent is working** the same full prompt remains visible and writable: spinner, reasoning and response output stay above it, while the blinking cursor remains at the active draft. `Tab` completes slash commands, `Esc` or `Ctrl+C` cancel the current turn without closing the CLI, and text confirmed with `Enter` is queued for the next turn. Queued `/` lines run as slash commands between turns.

---

## Built-in tools

The agent has direct access to these file-system and shell tools. All write operations are gated by safe mode (use `--no-safe` to bypass at your own risk).

| Tool | What it does |
|------|-------------|
| `readFile` | Read file contents (with line caching for large files) |
| `writeFile` | Create or overwrite a file |
| `editFile` | Apply targeted string replacements (diff-based, with undo tracking) |
| `listDir` | List directory contents |
| `findFiles` | Find files by glob pattern |
| `grepSearch` | Search file contents with regex |
| `runCommand` | Execute shell commands (safe-mode gated, dry-run aware) with a workspace-contained session cwd; network-to-shell pipes receive an explicit injection warning |

External tools from MCP servers are exposed alongside these with an `mcp__<server>__<tool>` naming convention.

When enabled, OpenRouter web search is sent as a provider-operated server tool;
it is not sent to Requesty or other providers. Search results are returned by
the provider and should be treated as untrusted external data.

---

## Skills system

Skills are YAML-frontmatter markdown files in `.agent/skills/`. Each skill defines a `name`, `description`, and `keywords`. When the agent detects a keyword match in your prompt, the skill's body is injected into the system prompt — giving the model domain-specific guidance without bloating context on every turn.

The project ships with 40+ built-in skills:

```
architecture        clean-code          tdd-workflow        code-review-checklist
react-patterns      nextjs-best-practices   tailwind-patterns   frontend-design
python-patterns     nodejs-best-practices   database-design     api-patterns
testing-patterns    systematic-debugging    performance-profiling   vulnerability-scanner
deployment-procedures   server-management  bash-linux          powershell-windows
seo-fundamentals    i18n-localization   mobile-design       game-development
mcp-builder         plan-writing        documentation-templates  brainstorming
parallel-agents     intelligent-routing  red-team-tactics   behavioral-modes
```

Activate a subset with `-s`:

```bash
emile -s clean-code,tdd-workflow,react-patterns "Refactor the dashboard components"
```

Add your own by dropping a `SKILL.md` into `.agent/skills/your-skill/`:

```yaml
---
name: my-skill
description: "Guidance for my specific workflow. Triggers on keywords: deploy, release."
keywords: [deploy, release, ship]
---
Your markdown instructions here...
```

---

## MCP integration

`emile` supports Model Context Protocol servers via STDIO transport. Configure servers in `mcp.json` at your project root:

```json
{
  "mcpServers": {
    "everything": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-everything"],
      "env": {}
    }
  }
}
```

On startup, the CLI connects to each configured server, discovers its tools, and exposes them to the agent alongside the built-in tools. MCP tool calls are namespaced as `mcp__<server>__<tool>` to avoid collisions.

---

## Configuration

### Environment variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `EMILE_PROVIDER` | API provider: `requesty`, `openrouter`, `opencode`, `opencode-go` | `requesty` |
| `REQUESTY_API_KEY` | API key for Requesty | — |
| `OPENROUTER_API_KEY` | API key for OpenRouter | — |
| `OPENCODE_API_KEY` | API key for OpenCode | — |
| `EMILE_DEFAULT_MODEL` | Default model ID | `anthropic/claude-3.5-sonnet` |
| `EMILE_DEFAULT_EFFORT` | Default reasoning effort | `low` |
| `EMILE_MAX_LOOP_ITERATIONS` | Maximum agent tool-loop iterations per turn | `40` |

### Config file

User-wide settings and credentials are persisted in `~/.emile/config.json` (auto-created on first run via the connect wizard), so provider setup follows the user across workspaces. This takes precedence over environment variables. Workspace-scoped sessions, undo state and web configuration remain under the project's gitignored `.emile/` directory; `.agent/` is also gitignored by default.

### Project rules

To apply your own always-on preferences to a workspace, create `.emilerules` at its root. Emile does not generate default rules: the file belongs to you and its contents are sent to the active model on every session. Do not place secrets in it. If `.emilerules` is absent, Emile can reuse user-maintained `AGENTS.md`, `.clinerules`, or `.cursorrules` files, in that order. Use `/rules` to see which source is active.

### Supported providers

| Provider | Base URL | Notes |
|----------|----------|-------|
| Requesty | `https://router.requesty.ai/v1` | Default; supports prompt caching |
| OpenRouter | `https://openrouter.ai/api/v1` | Broad live/cache-backed model catalog; searchable from `/model` |
| OpenCode | `https://opencode.ai/zen/v1` | Curated gateway; live model list searchable from `/model` |
| OpenCode Go | `https://opencode.ai/zen/go/v1` | Curated open-source models; live model list searchable from `/model` |

Any OpenAI-compatible endpoint works — the client uses the `openai` SDK under the hood.

---

## Project structure

```
emile-cli/
├── bin/
│   └── emile.js            # Entry point
├── src/
│   ├── cli.js              # Command parsing, REPL loop, slash commands
│   ├── config.js           # Config load/save, env var resolution
│   ├── models.js           # Dynamic OpenRouter model catalog + static fallback
│   ├── ui/model-picker.js  # Bounded incremental /model search UI
│   ├── prompt.js           # System prompt assembly
│   ├── rules.js            # Optional user-authored project rules discovery
│   ├── skills.js           # YAML skill parsing + keyword matching
│   ├── plans.js            # Plans mode: draft, approval, status
│   ├── history.js          # Session persistence (save/restore/list)
│   ├── mcp.js              # MCP server lifecycle + tool bridging
│   ├── commands.js         # Connect/model wizards
│   ├── agent/              # Agent loop, session stats, history compression
│   ├── api/                # OpenAI-compatible client + retry
│   ├── tools/              # Tool schemas, security gates, per-tool handlers
│   └── ui/                 # Terminal rendering (theme, boxes, prompt, thinking…)
├── .agent/skills/          # Skill modules (YAML frontmatter + markdown)
├── .emile/                 # Runtime config + session storage (gitignored)
├── mcp.json                # MCP server configuration
└── package.json
```

---

## Architecture

The agent runs a simple but powerful loop:

```
User input
    |
    v
+----------+    +--------------+    +---------------+
| System    |--->| LLM API call |--->| Parse response |
| Prompt +  |    | (streaming)  |    | (text + tools) |
| Skills +  |    +--------------+    +-------+-------+
| Tools +   |          |                     |
| History   |          v                     v
+----------+    +--------------+    +---------------+
                | Thinking     |    | Has tool calls?|
                | stream       |    +-------+-------+
                | (live)       |            |
                +--------------+       No --+-- Yes
                                         |     |
                                         v     v
                                    Print   Execute tools
                                    response  -> append results
                                              -> loop back to LLM
```

1. **System prompt** is assembled from the base prompt + active skills + tool definitions
2. **Context policy** estimates the full payload before the turn and compresses older history only at 80% of the active model's catalog window
3. **Streaming response** is parsed chunk-by-chunk: cumulative reasoning is reduced to unseen text before live rendering, text accumulates, and tool calls are assembled
4. **Tool execution** runs built-in handlers or MCP bridges, with safe-mode and dry-run checks
5. **Results** are appended to the message history and the loop continues until the model stops requesting tools
6. **Context tracking** updates on every API response using real `usage` tokens, with a pre-call character-based estimate as fallback

---

## Process & Engineering

This project follows formal Software Engineering practices (documentation as the single source of truth, Spec-Driven Development, feature registry and disciplined Git workflow):

- **[`.clinerules`](./.clinerules)** / [`AGENTS.md`](./AGENTS.md) — mandatory AI-agent rules loaded every session: required context reading (cache-conscious), doc synchronization after every change, SDD adherence, security gates and the **single-branch Git workflow**.
- **Git workflow** — ongoing code and documentation work stays on `development`; commits stage **only the files of the current scope** — never `git add .`. The workflow does not switch branches, create worktrees, merge, rebase or pull as a routine task step. See [`.clinerules` Rule 8](./.clinerules) and [CONTRIBUTING.md](./CONTRIBUTING.md).
- **[`specs/`](./specs/)** — **Spec-Driven Development (SDD)**: every implementation starts from a spec (`spec.md` → `plan.md` → `tasks.md`), with standardized templates and a traceable lifecycle. See the [full workflow](./specs/README.md).
- **[`features/`](./features/)** — catalog of delivered features, each traceable to its source spec. See the [index](./features/README.md).
- **ADRs** — architecture decisions documented in [`docs/adr/`](./docs/adr/).
- **CHANGELOG** — change history in [Keep a Changelog](./CHANGELOG.md) format.

### Documentation index

| Document | Contents | Status |
|----------|----------|--------|
| [Product (PRD)](./docs/product.md) | Vision, user stories, functional requirements | 🟢 Current |
| [Architecture](./docs/architecture.md) | System diagrams, agent loop, module map | 🟢 Current |
| [Visual Identity (TUI)](./docs/visual-identity.md) | Design system: Tokyo Night palette, components, visual-debt backlog | 🟢 Current |
| [Code Quality & Security](./docs/code-quality-and-security.md) | Risk classification, threat surfaces, secure coding, gates | 🟢 Current |
| [Roadmap](./docs/roadmap.md) | Phases 0–4: foundation, UI overhaul, automated quality, robustness, distribution | 🟢 Current |
| [Glossary](./docs/glossary.md) | Domain terms (plans mode, skills, MCP, prompt caching…) | 🟢 Current |
| [Code Improvements](./docs/IMPROVEMENTS.md) | Prioritized codebase improvement backlog (robustness, security, testing) | 🟢 Current |
| [Decisions (ADRs)](./docs/adr/) | Architecture decisions (stack, quality gates, active prompt output) | 🟢 Current |

> The [`.agent/`](./.agent/) directory contains generic AI agent kit configuration (agents, skills, workflows) — it is not product documentation.

---

## Contributing

This is a personal project, but issues and pull requests are welcome. See the [contribution guide](./CONTRIBUTING.md) for the full SDD workflow, branch/commit conventions, and quality gates. Quick pointers:

- **New skill**: Add `.agent/skills/your-skill/SKILL.md` with valid YAML frontmatter
- **New tool**: Add a definition + handler to `src/tools.js` following the existing pattern
- **New provider**: Add a `baseURL` branch in `src/api.js` and an env var in `src/config.js`
- **Bug fix**: Open an issue with reproduction steps, or submit a PR with a clear description

### Development

```bash
git clone https://github.com/mc33p/emile-cli.git
cd emile-cli
npm install
node bin/emile.js --verbose    # run from source with debug output
npm test                       # run the regression suite
npm run lint                   # lint src/, test/ and bin/
```

No build step — the project runs raw ES modules. Syntax-check individual files with `node --check src/<file>.js`.

---

## License

[MIT](LICENSE) — do what you want, just keep the copyright notice.

---

<div align="center">

Built for people who think faster than they type.

</div>
