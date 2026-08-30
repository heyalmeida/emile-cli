# Plan: Identify MCP tools in terminal output

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-30-mcp-tool-visibility` |
| **Status** | `implemented` |

## 1. Technical Approach

Update `formatToolSummary`/`printToolSummary` in `src/ui/tool-lines.js` to retain MCP server/tool components and render a dedicated `[mcp:server] tool` line. Split on the final `__`, matching `mcp.js`'s explicit map semantics for server names containing separators. Add pure formatting regression tests.

## 2. Design Compliance

Use the existing `C` palette, width cap and terminal-line primitives. No new dependency, command, file write or tool execution path.

## 3. Files

| Action | Path |
|--------|------|
| Modify | `src/ui/tool-lines.js`, `docs/visual-identity.md` |
| Create | `test/mcp-tool-visibility.test.js` |
| Sync | README/product/architecture, feature registry, backlog, changelog |

## 4. Git Workflow

| Item | Answer |
|------|--------|
| **Feature branch** | `feat/mcp-tool-visibility` |
| **Commit plan** | UI/test implementation, then docs sync. |
