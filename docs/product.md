# Emile — Product Requirements Document (PRD)

> **Status:** 🟢 Current · **Source of truth for emile-cli's scope and requirements.**
> Emile is a terminal coding agent, provider-agnostic (OpenAI-compatible), with built-in tools, user-global memory, MCP, optional OpenRouter web search, prompt caching, reasoning control, plans mode and a skills system.

---

## 1. Vision

Give any developer a **pair programmer that lives in the terminal**: fast, lightweight (no native modules, no build step), LLM-provider agnostic and transparent about cost and context. Emile doesn't try to be an IDE — it tries to be the most pleasant command-line agent to use.

### Value proposition

| For whom | Pain | Solution |
|-----------|-----|---------|
| Terminal-native devs | IDE agents are heavy and slow for spot tasks | Lightweight CLI with optimized startup and a fluid REPL |
| Devs unhappy with vendor lock-in | Claude Code/Codex tie you to one provider | Any OpenAI-compatible API (Requesty, OpenRouter, OpenCode) |
| Cost-conscious devs | Agents burn tokens with no feedback | `/cost`, real-time context tracking, prompt caching, configurable reasoning effort |
| Automation-cautious devs | Agents that run commands without asking | Safe mode, dry-run, command whitelist, `/undo` |
| Devs working across projects | Repeating the same preferences and corrections in every workspace | Confirmed user-global memory with inspection, pause and deletion controls |

---

## 2. User Stories

- **US-01:** As a dev, I want to hand over a task in natural language and get the code implemented in my workspace, so I never leave the terminal.
- **US-02:** As a dev, I want to watch the model's reasoning stream live by default (and be able to collapse it), to understand decisions before the code.
- **US-03:** As a dev, I want to approve or block shell command execution, to stay in control of my machine.
- **US-04:** As a dev, I want to undo the agent's file changes (`/undo`), to quickly revert mistakes.
- **US-05:** As a dev, I want to resume previous conversations per workspace, to pick up where I left off.
- **US-06:** As a dev, I want to search and choose a model and reasoning effort per run, to balance cost and quality without scanning a huge provider list.
- **US-07:** As a dev, I want to see the session's estimated cost and tokens, to control spending.
- **US-08:** As a dev, I want the implementation plan presented for my approval before any writes (plans mode), to review strategy before code.
- **US-09:** As a dev, I want to connect external tools via MCP, to extend the agent without touching the CLI's code.
- **US-10:** As a dev, I want domain knowledge (skills) injected into the prompt only when relevant, to get better answers without bloating context.
- **US-11:** As a dev, I want to define my own always-on project preferences and inspect which rules source is active, without the CLI inventing defaults for me.
- **US-12:** As a dev with several terminal tabs, I want Emile's tab title to show its current activity, so I can tell waiting and active sessions apart without opening each tab.
- **US-13:** As a dev using a large-context model, I want history compression to respect that model's real window, so useful context is not summarized prematurely.
- **US-14:** As a dev researching a current implementation or design, I want to opt into provider web search when supported, so the agent can use fresh external information while I remain aware of search costs.
- **US-15:** As a dev working across projects and providers, I want Emile to remember my confirmed preferences, workflow and recurring corrections globally, while letting me inspect, pause and forget them.

---

## 3. Functional Requirements (RF)

| ID | Requirement | Status |
|----|-----------|--------|
| **RF-01** | Conversational agent in a REPL with a tool-call loop (read, write, edit, search, list, run commands) | ✅ |
| **RF-02** | Connection to multiple OpenAI-compatible providers (Requesty, OpenRouter, OpenCode, OpenCode Go) with a setup wizard | ✅ |
| **RF-03** | Response streaming with monotonic live reasoning rendering visible by default, expand/collapse toggle (`/thinking`), and multiline prompt input (`Shift+Enter`) | ✅ |
| **RF-04** | Built-in tools: `readFile`, `writeFile`, `editFile` (diff), `listDir`, `findFiles`, `grepSearch`, `runCommand`; file arguments are validated and shell cwd persists within the workspace session | ✅ |
| **RF-05** | Execution gate: safe mode with a safe-command whitelist, `--no-safe` and `--dry-run` | ✅ |
| **RF-06** | `/undo [N]` to revert the agent's last or last N file modifications (undo stack) | ✅ |
| **RF-07** | Session persistence per workspace: save, list, resume with pending-tool recovery (`-H`, `/switch`, `/sessions`), bounded export/storage, and reasoning omitted by default | ✅ |
| **RF-08** | Reasoning effort control (`-e` low/medium/high/max/min/none), native Anthropic thinking budgets and searchable model selection (`-m`, `/model`) with live provider catalogs where available (OpenRouter, OpenCode, OpenCode Go) | ✅ |
| **RF-07** | Session persistence per workspace: save, list, resume with pending-tool recovery (`-H`, `/switch`, `/sessions`), bounded export/storage, workspace-contained session cwd, and reasoning omitted by default | ✅ |
| **RF-08** | Reasoning effort control (`-e` low/medium/high/max/min/none), native Anthropic thinking budgets and searchable model selection (`-m`, `/model`) | ✅ |
| **RF-09** | Per-provider prompt caching (Requesty) with bypass via `--no-cache` | ✅ |
| **RF-10** | Plans mode (`-p`): agent previews the task, asks for approval before model execution, drafts a plan, then executes | ✅ |
| **RF-11** | MCP integration over STDIO, SSE and streamable HTTP with `mcp__<server>__<tool>` namespacing, first-connect consent, bounded reconnect and server identity visible in tool output, configured in `mcp.json` | ✅ |
| **RF-12** | YAML skills system with workspace detection, task-relevance matching and conditional system-prompt injection (`-s` for an explicit subset) | ✅ |
| **RF-13** | Context and cost tracking: real API token usage with a pre-call estimate fallback, `/cost` | ✅ |
| **RF-14** | Coherent terminal UI: Tokyo Night palette, boxes, one persistent full prompt across idle/active turns, slash-command autocomplete, multiline keyboard editing and aligned multiline tool output | ✅ (continuous improvement — see [visual identity](visual-identity.md)) |
| **RF-15** | Automated test suite covering the critical modules (agent loop, tools, config) | ✅ Delivered (`npm test` + CI gate) |
| **RF-16** | Reference-grade UI experience: consistent visual hierarchy, progress feedback and layout | 🔄 In progress (spec `2026-08-25-tui-overhaul`) |
| **RF-17** | Optional user-authored project rules: `.emilerules` precedence, compatible fallbacks, bounded prompt injection and read-only `/rules` inspection | ✅ |
| **RF-18** | Dynamic terminal title driven by real runtime states, with sanitized/allowlisted activity labels and no prompt, command or query leakage | ✅ |
| **RF-19** | Context-aware history compression at 80% of the active model's catalog window, with full-payload token estimation and growth hysteresis | ✅ |
| **RF-20** | Explicit, provider-gated OpenRouter web search with bounded result parameters, a visible cost warning and no unsupported tool schema sent to other providers | ✅ |
| **RF-21** | Native user-global agent memory with conservative formation, bounded retrieval, conflict handling, crash-safe local storage and explicit privacy/deletion controls | ✅ Delivered ([spec](../specs/2026-09-03-global-agent-memory/spec.md)) |

---

## 4. Out of Scope (currently)

- GUI/desktop version — emile is and remains a CLI
- Own LLM server or fine-tuning
- Parallel execution of multiple agents in the same process
- Native Windows support beyond what Node already provides (focus on Linux/macOS)

---

## 5. Success metrics (for a serious personal project)

| Metric | Target |
|---------|----------|
| Startup to ready prompt | < 1.5s on a common machine (with MCP configured) |
| Tool-call reliability | 0 unhandled crashes on common tasks |
| Cost per typical task | Visible and predictable via `/cost` |
| Documentation sync | 0 docs ↔ code divergences when closing each spec |

---

## 6. Related

- [Architecture](architecture.md) — how the system fulfills these requirements
- [Visual Identity](visual-identity.md) — the TUI design system
- [Roadmap](roadmap.md) — phases and priorities
- [Glossary](glossary.md) — domain terms
