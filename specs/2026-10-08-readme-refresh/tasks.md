# Tasks: README.md refresh

- [x] T1. Skills claim: delete the 40+ count, the 32-name block and the intro
      sentence "The project ships with 40+ built-in skills"; rewrite the section
      around the mechanism (`.agent/skills/`, YAML `SKILL.md`, `-s`/auto-detect/`-s all`,
      `/skills`). → AC1
- [x] T2. Providers: header line and intro paragraph describe 4 gateways via one
      OpenAI-compatible client. → AC2
- [x] T3. MCP: features bullet and MCP section say stdio/sse/http; tool namespace
      `<server>__<tool>` in both places. → AC3
- [x] T4. Model default: `anthropic/claude-3-5-sonnet` in CLI table, env table,
      Configure example. → AC3
- [x] T5. Web search: feature bullet + `/websearch` row (on|off|status|native|enhanced)
      + new `/skills`, `/skill`, `/tavily`, `/firecrawl` rows; brief enhanced-web
      description in Built-in tools; env vars `TAVILY_API_KEY`/`FIRECRAWL_API_KEY`
      noted where keys are documented. → AC3
- [x] T6. Project-structure diagram: add `src/web/`, `src/lifecycle/`,
      `src/commands/`, `src/recovery.js`; mark `.agent/skills/` workspace-local. → AC1/AC3
- [x] T7. Config-file section: example keys exactly `provider, apiKey, model,
      effort, webSearch, maxLoopIterations`. → AC3
- [x] T8. Contributing: `src/api/client.js`, `src/tools/`. → AC3
- [x] T9. Full-feature audit pass: every remaining bullet/table row traced to
      `src/cli.js`, `src/commands/registry.js`, `src/config.js`, `src/tools/definitions.js`,
      `src/web/`, `src/memory/`, `src/plans.js`, `src/mcp.js`. Delete anything
      unverifiable. → AC2/AC3
- [x] T10. Gates: `npm run lint`; `git status` (only README.md + CHANGELOG.md);
      `git diff --stat`; manual claim trace. → AC4
- [x] T11. CHANGELOG `[Unreleased]` Docs entry; deep-dive § 21 P2-10 marked applied;
      commit on `development` with explicit paths. → AC5

## Verification script (manual)

1. `grep -niE "40\+|bundled|mcp__" README.md` → no hits.
2. Every flag in the CLI table ↔ `src/cli.js:25-41`.
3. Every slash command ↔ `src/commands/registry.js` ROOT_COMMANDS/SUBCOMMANDS.
4. Every env var/config key ↔ `src/config.js`.
5. Every tool name ↔ `src/tools/definitions.js` + `src/web/definitions.js`.
6. Base URLs ↔ `src/api/client.js:41-62`.
