# Spec: Preflight Plans approval and compression fallback

| Field | Value |
|-------|-------|
| **ID** | `2026-08-30-plans-compression-resilience` |
| **Status** | `implemented` |
| **Phase/Context** | Agent behaviour / backlog items 3.4 and 3.5 |
| **Related documents** | [PRD](../../docs/product.md), [Architecture](../../docs/architecture.md), [Code quality](../../docs/code-quality-and-security.md), [ADR-0001](../../docs/adr/0001-tech-stack-choice.md) |

## 1. Problem / Motivation

Plans mode currently streams and renders a model response before asking for approval, so cancellation occurs after the user has already seen execution-oriented output. Context compression currently continues with the full history when its summarization call fails, making the next request likely to overflow again. This implements `IMPROVEMENTS.md` §§3.4–3.5.

## 2. Goal

Ask for explicit Plans approval from a concise task preview before the first model stream, and fall back to bounded oldest-history truncation when summarization cannot complete.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-----------|---------------------|
| RF-S01 | In Plans mode, show a short sanitized preview of the initial task and request approval before the first API stream. | Must |
| RF-S02 | Cancellation before the first stream returns without making an API request or writing plan files. | Must |
| RF-S03 | Approval adds the existing plan-approval instruction and allows the normal streaming/tool loop to proceed. | Must |
| RF-S04 | When summarization fails at the compression gate, drop oldest complete history groups until the estimate is below 70% of the active context window. | Must |
| RF-S05 | Compression fallback preserves the primary system prompt and newest history, and does not bypass tool/file security. | Must |
| RF-S06 | A failed fallback remains non-fatal and does not create an infinite compression loop. | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|----------|
| **Risk classification** | High — changes when model output and workspace tools become reachable, and mutates durable conversation state. |
| **Assets/secrets** | Workspace files and user history; no new secrets are stored. |
| **Command execution / file writes** | Plans approval moves earlier; existing tool handlers and plan-file approval gates remain unchanged. Truncation only mutates in-memory history. |
| **Untrusted inputs** | Task preview is user text and is bounded/sanitized for the prompt; history is model/user output and only complete message groups are removed. |
| **Negative criteria** | No API call before rejected Plans approval; no partial tool group retained by truncation; no unbounded retry after compression failure. |

## 5. Out of Scope

- Changing Plans file format or the existing tool approval behavior.
- Summarizing with a second fallback model.
- Changing the normal compression threshold or model context calculation.

## 6. Acceptance Criteria

- **AC-01:** Given Plans mode and a task, when the turn starts, then the user sees a bounded preview and approval is requested before `createChatCompletion` is called.
- **AC-02:** Given Plans approval is rejected/cancelled, when the turn ends, then no model stream or tool call is executed.
- **AC-03:** Given Plans approval succeeds, when the turn proceeds, then the existing approval instruction is added and the normal stream remains available.
- **AC-04:** Given compression is required and summarization throws, when fallback runs, then oldest complete history groups are dropped until the serialized history is at or below 70% of the active context capacity, when possible.
- **AC-05:** Given fallback truncation, when history is inspected, then the primary system message and latest complete group remain, and no tool handler is invoked by compression.
- **AC-06:** Given repeated failure/insufficient history, when compression runs, then it returns safely without throwing or repeatedly retrying itself.

## 7. References

- `IMPROVEMENTS.md` §§3.4–3.5
- Existing `src/agent/agent.js`, `src/agent/compression.js` and `src/plans.js`.
