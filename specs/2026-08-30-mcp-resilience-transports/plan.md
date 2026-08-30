# Plan: Resilient MCP connections and network transports

## Technical approach

1. Keep MCP lifecycle state in `src/mcp.js`, adding an intentional-shutdown
   guard, per-server reconnect lock and bounded exponential retry schedule.
2. Centralize transport construction so STDIO remains the default while SSE
   and streamable HTTP use the official SDK transports. Validate URL schemes
   and resolve environment placeholders immediately before constructing a
   network transport.
3. Persist first-connection approval as server-name metadata in
   `.emile/mcp-consent.json`; ask through the existing prompt library before
   connecting and use a safe non-interactive refusal when no TTY exists.
4. Add pure helper exports and unit tests for transport normalization,
   interpolation, prompt preview and retry policy. Do not require a live MCP
   process or network server in the test suite.
5. Synchronize MCP product/architecture/security/visual documentation, update
   the existing MCP feature registry entry and close backlog items 5.1, 5.3
   and 5.4.

## Security decisions

- Only `http` and `https` URLs are accepted for remote transports.
- Header values are accepted only as strings and may interpolate existing
  environment variables; unresolved placeholders reject the connection.
- Prompts show only the command name, sanitized URL and configured tool names;
  args, headers and resolved secret values are never displayed.
- Reconnect attempts are finite and never run once shutdown begins.
