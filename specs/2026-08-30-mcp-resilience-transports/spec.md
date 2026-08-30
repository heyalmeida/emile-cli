# Spec: Resilient MCP connections and network transports

| Field | Value |
|-------|-------|
| **ID** | `2026-08-30-mcp-resilience-transports` |
| **Status** | `implemented` |
| **Phase/Context** | MCP robustness / backlog items 5.1, 5.3 and 5.4 |
| **Related documents** | [PRD](../../docs/product.md), [Architecture](../../docs/architecture.md), [Security](../../docs/code-quality-and-security.md), [Visual identity](../../docs/visual-identity.md), [ADR-0001](../../docs/adr/0001-tech-stack-choice.md) |

## 1. Problem / Motivation

MCP currently assumes a single STDIO connection that remains alive for the
whole process. A crashed server silently removes the external capability, and
the first connection has no explicit user consent. Remote MCP servers cannot
be configured even though the SDK supports HTTP-based transports.

## 2. Goal

Keep configured MCP tools available after a transient server death through a
bounded reconnect policy, ask for approval before the first connection, and
support `stdio`, `sse` and streamable `http` transports without exposing
credentials in terminal output.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-------------|---------------------|
| RF-S01 | An unexpected connected-server close retries at 500ms, 1s and 2s, then degrades with a warning. | Must |
| RF-S02 | Intentional shutdown never schedules a reconnect. | Must |
| RF-S03 | A server not previously approved prompts before its transport is established; approval is remembered per workspace/server. | Must |
| RF-S04 | The approval prompt identifies the server, transport and configured tool metadata without printing headers, tokens or command arguments. | Must |
| RF-S05 | `mcp.json` supports `transport: "stdio"`, `transport: "sse"` and `transport: "http"`; HTTP URLs are restricted to `http`/`https`. | Must |
| RF-S06 | HTTP/SSE header values may use `${ENV_NAME}` interpolation; missing variables fail closed and secrets are never logged. | Must |
| RF-S07 | Existing STDIO tool namespacing and dispatch remain unchanged. | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|----------|
| **Risk classification** | High — external processes, network connections and optional credentials are involved. |
| **Assets/secrets** | MCP environment variables, HTTP authorization headers and user workspace configuration. |
| **Command execution / file writes** | STDIO launches only the configured MCP command; consent metadata is written under `.emile/`, never to arbitrary paths. |
| **Untrusted inputs** | `mcp.json` server names, commands, URLs, headers and tool metadata. Values are validated at the transport boundary and are not used as shell commands by emile. |
| **Negative criteria** | No reconnect after intentional shutdown; no unbounded retries; invalid URL/header interpolation fails before connect; credentials never appear in warnings or prompts; rejected first connections expose no tools. |

## 5. Out of Scope

- OAuth browser flows for remote MCP servers.
- Automatic installation or discovery of MCP servers.
- Changing MCP tool names or the built-in tool security gates.

## 6. Acceptance Criteria

- **AC-01:** A transport close schedules at most three retries at 500ms, 1s and 2s, and emits one terminal warning after the third failure.
- **AC-02:** Calling `shutdownMcp()` prevents all close callbacks from reconnecting.
- **AC-03:** An unapproved server is shown a consent prompt before `client.connect()`; a rejection leaves it disconnected and unexposed.
- **AC-04:** STDIO, SSE and HTTP definitions create the expected SDK transport; invalid protocols and unresolved `${ENV_NAME}` values fail closed.
- **AC-05:** Existing MCP namespace and tool-call tests pass unchanged, and new tests cover retry/consent/transport boundaries.

## 7. References

- `IMPROVEMENTS.md` §§5.1, 5.3–5.4
- `src/mcp.js`
- `@modelcontextprotocol/sdk` client transport declarations
