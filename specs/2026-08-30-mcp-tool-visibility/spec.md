# Spec: Identify MCP tools in terminal output

| Field | Value |
|-------|-------|
| **ID** | `2026-08-30-mcp-tool-visibility` |
| **Status** | `implemented` |
| **Phase/Context** | MCP/UI / backlog item 6.3 |
| **Related documents** | [PRD](../../docs/product.md), [Architecture](../../docs/architecture.md), [Visual identity](../../docs/visual-identity.md), [ADR-0001](../../docs/adr/0001-tech-stack-choice.md) |

## 1. Goal

Make third-party MCP execution visible in the tool summary by rendering the server identity and tool name, while preserving existing compact alignment and sanitization.

## 2. Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| RF-S01 | MCP tool summaries show `[mcp:<server>] <tool>` to the user. | Must |
| RF-S02 | Server/tool parsing remains unambiguous when either name contains `__`. | Must |
| RF-S03 | Built-in tool summaries retain their current labels and behavior. | Must |

## 3. Risk and Security

| Field | Answer |
|-------|----------|
| **Risk classification** | Medium — terminal rendering of external names; no execution contract changes. |
| **Assets/secrets** | MCP server/tool identifiers only. |
| **Untrusted inputs** | Names are sanitized by existing UI activity/rendering paths and bounded by terminal width. |
| **Negative criteria** | No MCP arguments or result content are exposed in the server label; no tool dispatch behavior changes. |

## 4. Acceptance Criteria

- **AC-01:** An MCP call named `filesystem__readFile` renders `[mcp:filesystem] readFile`.
- **AC-02:** Names containing multiple separators split at the final separator consistently with the explicit tool map.
- **AC-03:** Built-in `readFile`/`runCommand` formatting remains unchanged.

## 5. References

- `IMPROVEMENTS.md` §6.3
- `src/ui/tool-lines.js`, `src/mcp.js`
