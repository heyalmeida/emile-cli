# Spec: README.md refresh — claims aligned with shipped code (P2-10 + skills claim)

Date: 2026-10-08 · Branch: `development` · Docs-only (NO changes under `src/`, `test/`, `bin/`)

## Problem

`README.md` is the project's front door but overpromises and describes shipped
behavior imprecisely. A reader evaluating the project cannot verify its claims
against the code — and in one case the claim is flatly false:

- **C1 (line 34 + § Skills system):** advertises "40+ YAML-based skill modules"
  and lists 32 bundled skill names. Reality: no skills are bundled — `.gitignore:139-142`
  excludes `.agent/`, `.agents/`, `.clinerules` — and `loadAllSkills()`
  (`src/skills.js:51`) resolves the non-existent nested path
  `.agent/.agents/.skills/skills`. A fresh clone loads ZERO skills.
- **C2 (line 7 + line 20):** framing implies a single provider ("Requesty,
  OpenRouter, OpenCode" as one family; elsewhere "Requesty API models"). Reality:
  four gateways — Requesty, OpenRouter, OpenCode Zen, OpenCode Go — via one
  OpenAI-compatible client with a per-provider `baseURL` branch
  (`src/api/client.js:30-68`).
- **C3 (line 30 + § MCP integration):** says MCP runs via "STDIO transport".
  Reality: stdio/sse/http (`src/mcp.js:77-82`).
- **C4 (lines 168, 228):** MCP tool naming claimed as `mcp__<server>__<tool>`.
  Reality: `<server>__<tool>` (`src/mcp.js:14`, `mcp.js:322`).
- **C5 (line 96 + line 242 + line 75):** default model written
  `anthropic/claude-3.5-sonnet`. Reality: `anthropic/claude-3-5-sonnet`
  (`src/config.js:98`).
- **C6 (line 38 + § Slash commands `/websearch`):** web search documented as
  OpenRouter-only toggle. Reality: `/websearch` accepts `on|off|status|native|enhanced`
  (`src/commands/registry.js:68`); enhanced mode adds billable Tavily (`searchWeb`)
  and Firecrawl (`browsePage`) agent tools gated on `webSearch && webSearchMode==='enhanced'`
  plus per-provider key+enable (`src/web/definitions.js:41-51`); `/tavily` and
  `/firecrawl` commands exist (`registry.js:69-70`, dispatch `src/commands/index.js:34-35`).
- **C7 (§ Slash commands):** table omits `/skills`, `/skill` (search workspace
  skills) — both in `src/commands/registry.js:61-62`.
- **C8 (line 296, Project structure):** structure diagram omits `src/web/`,
  `src/lifecycle/`, `src/commands/`, `src/recovery.js`; also presents `.agent/skills/`
  as part of the repo although `.agent/` is gitignored. (This is deep-dive § 21 P2-10.)
- **C9 (Contributing):** "New provider: Add a `baseURL` branch in `src/api.js`" —
  the file is `src/api/client.js`; "New tool: … to `src/tools.js`" — tools live
  in `src/tools/` (`definitions.js` + `handlers/`).

## Verified context (claim → code)

- Flags: all 13 CLI flags in the README table exist in `src/cli.js:25-41`; the
  `-s` default is `'all'` (`cli.js:33`), which triggers auto-detection +
  task-relevance filtering (`src/skills.js:187-194`, `162-180`); explicit lists
  bypass relevance filtering.
- Slash commands: truth source is `src/commands/registry.js` (`ROOT_COMMANDS`,
  49-73) — the README table is missing `/skills`, `/skill`, `/tavily`, `/firecrawl`
  and understates `/websearch`.
- Config keys: `saveUserConfig()` (`src/config.js:145-152`) persists exactly
  `provider`, `apiKey`, `model`, `effort`, `webSearch`, `maxLoopIterations`.
- Built-in tools: `readFile`, `writeFile`, `editFile`, `listDir`, `findFiles`,
  `grepSearch`, `runCommand`, `proposeMemory`, `recallMemory` — exactly the nine
  in `src/tools/definitions.js:7-132`. The README tools table is accurate as-is.
- Providers: base URLs in `src/api/client.js:41-62` match the README providers
  table (Requesty default, OpenRouter, OpenCode Zen, OpenCode Go); model catalogs
  exist for OpenRouter AND OpenCode Zen/Go (`src/models.js:251-259`).
- Env vars: `EMILE_PROVIDER`, `REQUESTY_API_KEY`, `OPENROUTER_API_KEY`,
  `OPENCODE_API_KEY`, `EMILE_DEFAULT_MODEL`, `EMILE_DEFAULT_EFFORT`,
  `EMILE_WEB_SEARCH`, `EMILE_MAX_LOOP_ITERATIONS`, `EMILE_MAX_SESSION_SIZE` all
  exist in `src/config.js`.
- Tab toggles plans mode (`src/ui/prompt-input-persistent.js:209`); `Tab` also
  accepts autocomplete.
- Skills mechanism (documented design, `docs/architecture.md:49`): skills live in
  `.agent/skills/` as YAML-frontmatter `SKILL.md` files. The CODE currently
  resolves the broken nested path — that is backlog P0-2, NOT this brief. The
  README documents the mechanism, states no bundled count, and must not claim
  P0-2/P1-5 (multi-root) as done.

## Requirements

- R1. No "40+ skills" or any bundled-skill count claim remains; the mechanism
  description names `.agent/skills/`, YAML `SKILL.md` frontmatter, the activation
  paths (`-s <list>`, auto-detection, `-s all` default per `src/cli.js:33`) and
  the `/skills` command. The 32-name block is deleted.
- R2. Providers framed as the four gateways via one OpenAI-compatible client
  (Requesty, OpenRouter, OpenCode Zen, OpenCode Go; `src/api/client.js:30-68`).
  README only — stale "Requesty API models" strings in `package.json:4` and
  `src/cli.js:27` are reported as follow-up, not edited.
- R3. MCP section + features bullet: stdio/sse/http transports; tool namespace
  `<server>__<tool>`; `mcp__` claims removed.
- R4. Default model shown as `anthropic/claude-3-5-sonnet` everywhere.
- R5. Web search honestly described: OpenRouter native provider search + optional
  enhanced mode (Tavily `searchWeb`, Firecrawl `browsePage`, billable, per-provider
  keys); `/websearch on|off|status|native|enhanced`, `/tavily`, `/firecrawl` in the
  slash table; `/skills` added.
- R6. Project-structure diagram gains `src/web/`, `src/lifecycle/`, `src/commands/`,
  `src/recovery.js`; `.agent/skills/` marked as workspace-local (gitignored).
- R7. Contributing pointers point at real paths (`src/api/client.js`, `src/tools/`).
- R8. Config-file section shows keys matching `saveUserConfig()` output exactly.
- R9. No claims for unbuilt features: no `/provider` command, no `modelOverrides`,
  no multi-root skills, no models.dev catalog.
- R10. Preserve structure/branding (badges, screenshots, install steps) and tone —
  correction pass, not rewrite.

## Acceptance criteria

- [ ] AC1 — No bundled-skill count claim; mechanism description honest (C1).
- [ ] AC2 — Providers described as 4 gateways (C2); every feature bullet traced
      to code (sources above).
- [ ] AC3 — Every flag/command/config key mentioned exists in `src/cli.js:25-41`,
      `src/commands/registry.js` or `src/config.js`.
- [ ] AC4 — `git status` shows only `README.md` (+ `CHANGELOG.md`); `npm run lint`
      unchanged/green.
- [ ] AC5 — deep-dive § 21 P2-10 marked applied; CHANGELOG `[Unreleased]` Docs entry.
