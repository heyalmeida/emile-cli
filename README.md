<div align="center">

# emile

**A terminal-based AI coding agent that lives in your workspace.**

Connects to any OpenAI-compatible LLM provider (Requesty, OpenRouter, OpenCode) with built-in tools, MCP integration, prompt caching, reasoning control, and a Claude Code–style streaming UI.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-%3E%3D18-green.svg)](https://nodejs.org)

</div>

---

## What is this?

`emile` is a coding agent you run from your terminal. You give it a task in plain English, and it reads files, writes code, runs commands, and iterates — all within your current working directory. Think of it as a pair-programmer that never gets tired of refactoring.

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
- **Session persistence** — conversations are saved per workspace; resume, switch, export to Markdown, or rewind to edit your last message
- **Context tracking** — real token usage from the API with a pre-call estimate fallback, shown in the prompt footer
- **Claude Code–style UI** — boxed writing field, autocomplete for slash commands, `Esc` to cancel a draft, Tokyo Night color palette throughout
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
| `-s, --skills <list>` | Comma-separated skills to activate (default: all) | `all` |
| `-H, --history` | Select and resume a past session | `false` |
| `--no-safe` | Bypass the safe-execution gate for shell commands | safe mode on |
| `--dry-run` | Simulate file changes and command execution without writing | `false` |
| `--verbose` | Show setup and MCP initialization logs | `false` |

---

## Slash commands

Inside the interactive REPL, type `/` to see autocomplete. Available commands:

| Command | Description |
|---------|-------------|
| `/connect` | Reconfigure API provider and key |
| `/model` | Switch the active model |
| `/switch` `/sessions` | Resume a previous session |
| `/new` `/clear` | Start a fresh session |
| `/rewind` | Remove your last message (and the agent's reply) and re-edit it |
| `/undo` | Revert the last file modification made by the agent |
| `/cost` | Show cumulative token usage and estimated cost |
| `/export` | Export the current session as a Markdown file |
| `/thinking` | Toggle reasoning stream visibility (expanded / collapsed) |
| `/help` | Show the in-app command reference |
| `exit` | Quit the CLI |

**Keyboard shortcuts in the prompt:**

| Key | Action |
|-----|--------|
| `Tab` | Accept autocomplete suggestion / toggle plans mode |
| `Up` `Down` | Navigate autocomplete entries |
| `Esc` | Clear the current draft without sending |
| `Ctrl+C` | Exit immediately |

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
| `runCommand` | Execute shell commands (safe-mode gated, dry-run aware) |

External tools from MCP servers are exposed alongside these with an `mcp__<server>__<tool>` naming convention.

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

### Config file

Settings are persisted in `.emile/config.json` (auto-created on first run via the connect wizard). This takes precedence over environment variables. The `.emile/` and `.agent/` directories are gitignored by default.

### Supported providers

| Provider | Base URL | Notes |
|----------|----------|-------|
| Requesty | `https://router.requesty.ai/v1` | Default; supports prompt caching |
| OpenRouter | `https://openrouter.ai/api/v1` | Broad model catalog |
| OpenCode | `https://api.opencode.ai/v1` | OpenAI-compatible gateway |
| OpenCode Go | `https://opencode.ai/zen/go/v1` | Curated open-source models |

Any OpenAI-compatible endpoint works — the client uses the `openai` SDK under the hood.

---

## Project structure

```
emile-cli/
├── bin/
│   └── emile.js            # Entry point
├── src/
│   ├── cli.js              # Command parsing, REPL loop, slash commands
│   ├── agent.js            # Agent loop: streaming, tool dispatch, context tracking
│   ├── api.js              # OpenAI-compatible client (multi-provider)
│   ├── ui.js               # Terminal rendering: boxes, thinking stream, prompt, history
│   ├── spinner.js          # Zero-dependency Braille spinner
│   ├── tools.js            # Built-in file/shell tool definitions + handlers
│   ├── mcp.js              # MCP server lifecycle + tool bridging
│   ├── skills.js           # YAML skill parsing + keyword matching + compilation
│   ├── plans.js            # Plans mode: draft, approval, status rendering
│   ├── prompt.js           # System prompt assembly
│   ├── config.js           # Config load/save, env var resolution
│   ├── history.js          # Session persistence (save/restore/list)
│   └── commands.js         # Connect/model wizards
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
2. **Streaming response** is parsed chunk-by-chunk: reasoning deltas render live, text accumulates, tool calls are assembled
3. **Tool execution** runs built-in handlers or MCP bridges, with safe-mode and dry-run checks
4. **Results** are appended to the message history and the loop continues until the model stops requesting tools
5. **Context tracking** updates on every API response using real `usage` tokens, with a pre-call character-based estimate as fallback

---

## Contributing

This is a personal project, but issues and pull requests are welcome. If you want to add a skill, a tool, or a provider, here's how:

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
```

No build step — the project runs raw ES modules. Syntax-check individual files with `node --check src/<file>.js`.

---

## License

[MIT](LICENSE) — do what you want, just keep the copyright notice.

---

<div align="center">

Built for people who think faster than they type.

</div>
```