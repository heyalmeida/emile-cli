# Spec: Session summaries and tool checkpoints

| Field | Value |
|-------|-------|
| **ID** | `2026-08-30-session-resilience` |
| **Status** | `implemented` |
| **Phase/Context** | Agent behaviour / backlog items 2.2 and 2.3 |
| **Related documents** | [PRD](../../docs/product.md), [Architecture](../../docs/architecture.md), [Code quality](../../docs/code-quality-and-security.md), [ADR-0001](../../docs/adr/0001-tech-stack-choice.md) |

## 1. Problem / Motivation

Session titles are derived from the first prompt and become misleading after a long conversation. Sessions are also saved only after a successful turn, so a process failure during tool execution loses the assistant tool-call batch and cannot recover safely. This implements `IMPROVEMENTS.md` §§2.2–2.3.

## 2. Goal

Refresh the persisted session summary after the second completed user turn and every tenth turn thereafter, and persist an explicit pre-tool checkpoint that can be detected and resumed after loading.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-----------|---------------------|
| RF-S01 | Keep the existing first-prompt title until the second completed turn, then generate a concise summary using a low-effort, uncached completion. | Must |
| RF-S02 | Refresh the summary again at each tenth completed turn without changing message history. | Must |
| RF-S03 | Save an explicit `tool_pending` checkpoint after the assistant tool-call message is assembled and before any tool executes. | Must |
| RF-S04 | Detect a `tool_pending` session on load and execute only the recorded pending tool calls once before continuing the agent turn. | Must |
| RF-S05 | Keep completed turns marked `complete`; failed summary generation is non-fatal and retains the previous title. | Must |
| RF-S06 | Preserve existing session JSON compatibility for records without checkpoint metadata. | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|----------|
| **Risk classification** | High — session recovery can execute model-supplied tool calls and writes durable history. |
| **Assets/secrets** | Session files, workspace files, API configuration and tool arguments. No secrets may enter summaries or logs. |
| **Command execution / file writes** | Recovery must call the same `executeTool` path as normal turns, preserving `resolveSafePath`, safe mode, dry-run and command whitelist gates. Checkpoints use the existing history directory. |
| **Untrusted inputs** | Checkpoint JSON and tool arguments are untrusted persisted/model data; validate record shape and re-use tool handler boundaries. Summary text is sanitized before UI rendering and bounded in length. |
| **Negative criteria** | Never execute a malformed checkpoint, duplicate a completed tool call, expose API keys in a summary, or let summary failure abort a normal turn. |

## 5. Out of Scope

- Migrating or rewriting old session files.
- Changing tool permissions, safe mode, dry-run or session directory location.
- Summarizing every turn or adding a user-facing summary command.

## 6. Acceptance Criteria

- **AC-01:** Given one completed turn, when saved, then the first-prompt summary remains unchanged.
- **AC-02:** Given two completed turns, when the second is saved, then a bounded generated summary replaces the initial title; the summarizer uses `effort: low`, `useCache: false`, and no stream.
- **AC-03:** Given ten completed turns after the prior refresh, when saved, then the summary is refreshed again; other turns do not call the summarizer.
- **AC-04:** Given an assistant message with valid tool calls, when the normal agent reaches tool execution, then a `tool_pending` checkpoint is saved before the first tool starts.
- **AC-05:** Given a loaded `tool_pending` session, when resumed, then each pending tool call is executed once through the existing handler path, results are appended, and the record becomes `complete` after the turn finishes.
- **AC-06:** Given malformed/legacy checkpoint metadata or a summary API failure, when loading/turn completion occurs, then the CLI remains usable and does not execute unvalidated tools.

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|---------|--------------------|
| Crash after a tool executes but before its result is persisted | High | Save a complete checkpoint after each tool result; recovery executes only calls without a matching persisted result. |
| Summary call adds latency at refresh boundaries | Medium | Use low effort, no cache, bounded context and only refresh at turn 2/10N. |

## 8. References

- `IMPROVEMENTS.md` §§2.2–2.3
- Existing session persistence in `src/history.js` and agent loop in `src/agent/agent.js`.
