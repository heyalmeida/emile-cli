# Feature: MCP Integration

| Field | Value |
|-------|-------|
| **Status** | `active` |
| **Delivery date** | 2026-08-30 |
| **Source spec** | `specs/2026-08-30-mcp-tool-visibility` + `specs/2026-08-30-mcp-resilience-transports` |
| **PRD RFs served** | RF-11 |
| **Owner/Area** | MCP / UI |

## Description

Emile connects to configured MCP servers over STDIO, SSE or streamable HTTP and exposes their tools to the agent with collision-resistant namespacing. New servers require one-time approval per workspace. Unexpected disconnects receive three bounded reconnect attempts, while the terminal identifies each external call with its server name so users can distinguish third-party execution from built-in tools.

## Technical Details

| Item | Detail |
|------|---------|
| **Configuration** | `mcp.json` server definitions; remote entries use `transport`, `url` and optional `headers` with `${ENV_NAME}` interpolation |
| **Lifecycle** | First connection requires approval; unexpected closes retry at 500ms, 1s and 2s |
| **Tool namespace** | `mcp__<server>__<tool>` |
| **Terminal display** | `[mcp:<server>] <tool>` |
| **Applicable security gates** | Environment allowlist and explicit MCP tool mapping |

## Where It Lives in the Code

| Layer | Main paths |
|-------|------------|
| MCP bridge | `src/mcp.js` |
| Tool display | `src/ui/tool-lines.js` |

## Known Limitations

Remote transport authentication is header-based; OAuth browser flows and automatic MCP server discovery are not included. Non-interactive sessions refuse unapproved first connections.

## Change History

| Date | Change | Reference |
|------|--------|-----------|
| 2026-08-30 | Added server identity to MCP tool summaries | Source spec / CHANGELOG |
| 2026-08-30 | Added first-connect consent, bounded reconnect and SSE/HTTP transports | `specs/2026-08-30-mcp-resilience-transports` |
| 2026-08-30 | Redacted authenticated URLs and bearer tokens from transport errors | `c65233d` |
