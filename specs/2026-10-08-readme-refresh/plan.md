# Plan: README.md refresh — claims aligned with shipped code

Date: 2026-10-08 · Branch: `development` · Docs-only

## Approach

Line-level correction pass over `README.md`, preserving structure, badges, install
steps and tone. Every edited claim is traced to a verified code source before it
is written. Audit method: for each section, extract claim → locate implementing
code (F4/F5 truth sources) → fix or delete.

## Impacted files

| File | Change |
|------|--------|
| `README.md` | C1-C9 corrections (skills claim, providers, MCP, model default, websearch, slash table, structure diagram, contributing paths) |
| `CHANGELOG.md` | `[Unreleased]` Docs entry |
| `docs/deep-dive.md` | § 21 P2-10 marked applied (same pattern as P2-8) |
| `specs/2026-10-08-readme-refresh/` | this spec (the brief's allowed exception) |

## Decisions

- **Skills section:** document the mechanism as designed (`.agent/skills/`,
  YAML `SKILL.md`, `name`/`description`/`keywords` frontmatter — same wording
  `docs/architecture.md:49` uses), state NO bundled count, keep the authoring
  example, list activation paths (`-s <list>` explicit; default `-s all` =
  workspace auto-detection + task-relevance filtering; `/skills` to search).
  The broken load path (`skills.js:51`) is P0-2's job — the README must not
  document it as fixed, and this brief does not mention the broken path either
  (it documents the mechanism, which is what the code is being restored to).
- **Providers framing:** one sentence in the header ("four gateways — Requesty,
  OpenRouter, OpenCode Zen, OpenCode Go — through one OpenAI-compatible client");
  the Supported-providers table already matches `client.js:41-62` and stays.
  `package.json:4` and `src/cli.js:27` stay untouched (out of scope; follow-up).
- **Web search:** one corrected feature bullet + honest `/websearch` row + two new
  slash rows (`/tavily`, `/firecrawl`); enhanced-web tool names (`searchWeb`,
  `browsePage`) mentioned once under Built-in tools as conditional agent tools.
  Keys (`tavilyApiKey`, `firecrawlEnabled`, …) are workspace-local in
  `.emile/web.json` — described briefly, matching `src/web/config.js`.
- **MCP namespace:** `<server>__<tool>` per `mcp.js:14`/`mcp.js:322` (matches the
  P2-11 decision made for architecture.md — the two docs must not contradict).
- **Not added:** `/provider` command, `modelOverrides`, multi-root skills,
  models.dev — none exist; P1-3/P1-4/P1-5/P1-6 own their README lines.
- **Claim deletion rule:** any bullet I cannot trace to `src/` gets deleted, not
  reworded. Feature bullets 1-14 all verified except the skills count (C1) and
  the web-search framing (C6).

## Out of scope (reported, not fixed)

- `package.json:4` and `src/cli.js:27` "Requesty API models" strings.
- `docs/architecture.md` alignment (P2-11 owns it) — coordinated only by using
  the same MCP namespace (`<server>__<tool>`) and skills path (`.agent/skills/`).
- Restoring bundled skills / the skills path (P0-2) and multi-root (P1-5).
