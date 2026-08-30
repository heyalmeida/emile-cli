# Spec: Keep model reasoning out of persisted sessions by default

| Field | Value |
|-------|-------|
| **ID** | `2026-08-30-session-reasoning-retention` |
| **Status** | `implemented` |
| **Phase/Context** | Session persistence / backlog item 7.7 |
| **Related documents** | [PRD](../../docs/product.md), [Architecture](../../docs/architecture.md), [Code quality](../../docs/code-quality-and-security.md), [ADR-0001](../../docs/adr/0001-tech-stack-choice.md) |

## 1. Problem / Motivation

Reasoning content is useful for the active terminal stream but can make session JSON files large and can expose internal model reasoning in history/export artifacts. Persistence should be minimized by default while keeping an explicit opt-in for Markdown export.

## 2. Goal

Strip `reasoning_content` from disk session snapshots without mutating in-memory history, and omit it from `/export` unless `--export-thinking` is explicitly selected.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-----------|---------------------|
| RF-S01 | Session files never persist `reasoning_content` by default. | Must |
| RF-S02 | In-memory messages remain unchanged after saving. | Must |
| RF-S03 | `/export` omits reasoning by default and includes it with `--export-thinking`. | Must |
| RF-S04 | Other message fields and tool calls remain intact. | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|----------|
| **Risk classification** | Medium — changes durable session/export representation but does not execute tools. |
| **Assets/secrets** | Session files and model reasoning content. |
| **Command execution / file writes** | Only existing session/export writes are affected; no new paths are introduced. |
| **Untrusted inputs** | Reasoning is copied only as data; export remains Markdown generated from existing in-memory messages. |
| **Negative criteria** | Saving must not mutate the live message array; export must not include reasoning without explicit opt-in. |

## 5. Out of Scope

- Removing structured `reasoning_details` from active in-memory messages.
- Re-encrypting or migrating existing session files.

## 6. Acceptance Criteria

- **AC-01:** Given an assistant message with `reasoning_content`, when saved, then the persisted representation omits that field.
- **AC-02:** Given the same message in memory, after saving, then its reasoning remains available to the active session.
- **AC-03:** Given `/export` without opt-in, then the Markdown contains no thought block; with `--export-thinking`, it contains the thought block.
- **AC-04:** Given arbitrary non-reasoning fields, then persistence preserves them.

## 7. References

- `IMPROVEMENTS.md` §7.7
- Existing `src/history.js`, `src/commands/handlers.js` and `src/cli.js`
