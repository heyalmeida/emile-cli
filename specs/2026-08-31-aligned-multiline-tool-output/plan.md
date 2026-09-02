# Plan: Aligned multiline tool output

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-31-aligned-multiline-tool-output` |
| **Status** | `implemented` |

## 1. Technical Approach

Update `printToolSummary` in `src/ui/tool-lines.js` to split each displayed
argument into physical lines, sanitize each line through the existing terminal
control helper, truncate each line to the existing argument width, and prefix
continuations with spaces equal to the current tool-row argument column.

## 2. Architectural Compliance

- Keep all rendering in the UI layer and use the existing `C` palette.
- Preserve the tool summary data contract and `turnState` accounting.
- Follow the visual identity grid and no-ANSI-leakage rules.
- No new dependency or ADR is needed.

## 3. Security and Threat Model

| Element | Handling |
|----------|------------|
| Command execution and whitelist | Not applicable; no command is executed. |
| File writes and `resolveSafePath` | Not applicable; no file is changed. |
| LLM inputs | Tool names/arguments remain untrusted display data and are sanitized/bounded. |
| Secrets | No new persistence or logging; displayed arguments retain existing truncation. |
| Controls and negative tests | Regression test covers multiline alignment and terminal-control removal. |

## 4. Impacted Modules

| Module | Path | Change |
|--------|---------|---------|
| Terminal UI | `src/ui/tool-lines.js` | Align physical continuation lines and preserve bounds. |
| UI tests | `test/mcp-tool-visibility.test.js` | Add multiline rendering contract test. |

## 5. Files to Create/Modify

| Action | Path (expected) | Notes |
|------|--------------------|-------------|
| Modify | `src/ui/tool-lines.js` | Shared continuation-line formatter. |
| Modify | `test/mcp-tool-visibility.test.js` | Regression coverage. |

## 6. Verification Strategy and Gates

- Test `formatToolSummary` retains the complete multiline argument data.
- Capture `process.stdout.write` around `printToolSummary` and assert
  continuation indentation, no raw ANSI controls and bounded physical lines.
- Run `node --check src/ui/tool-lines.js`, `npm test`, `npm run lint` and
  `git diff --check`.
- Run a narrow terminal smoke using `node bin/emile.js --help`; the full
  interactive smoke remains subject to the configured external MCP server.

## 7. Git Workflow

| Item | Answer |
|--------|--------|
| **Feature branch** | `feat/ux-ui` |
| **Documentation branch** | `docs/documentation` |
| **Commit plan** | Spec/docs on `docs/documentation`; source/tests on `feat/ux-ui`; CHANGELOG and registry remain documentation-only. |
