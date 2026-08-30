# Spec: Friendly API failures and network-pipe warnings

| Field | Value |
|-------|-------|
| **ID** | `2026-08-30-error-ux` |
| **Status** | `implemented` |
| **Phase/Context** | Error handling and tools / backlog items 6.2 and 6.4 |
| **Related documents** | [PRD](../../docs/product.md), [Architecture](../../docs/architecture.md), [Security](../../docs/code-quality-and-security.md), [ADR-0001](../../docs/adr/0001-tech-stack-choice.md) |

## 1. Goal

Replace common raw API failure output with actionable messages and make safe-mode confirmation explicitly call out network content piped into a shell interpreter.

## 2. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-----------|---------------------|
| RF-S01 | Classify authentication, model, context, rate-limit and timeout failures into actionable user messages. | Must |
| RF-S02 | Preserve original error status/objects for retry, overflow handling and fallback logic. | Must |
| RF-S03 | Detect common `curl`/`wget` network-to-shell pipelines and show a specific warning before confirmation. | Must |
| RF-S04 | Non-network commands retain the existing generic safe-mode confirmation. | Must |

## 3. Risk and Security

| Field | Answer |
|-------|----------|
| **Risk classification** | High — modifies shell execution confirmation and API failure paths. |
| **Assets/secrets** | API keys and workspace command execution. |
| **Command execution / file writes** | No gate is removed; the warning appears before the existing confirmation and denial remains the default. |
| **Untrusted inputs** | Error messages and shell commands are bounded/sanitized for display; no command is rewritten or auto-approved. |
| **Negative criteria** | API classification must not alter retry semantics; network-pipe detection must never bypass confirmation. |

## 4. Acceptance Criteria

- **AC-01:** Common API statuses/codes return actionable messages without changing the original error object.
- **AC-02:** A 429 without `Retry-After` schedules the documented 10-second wait.
- **AC-03:** Network-to-shell commands receive the specific injection warning; safe commands retain the normal prompt.
- **AC-04:** Tests cover context overflow and fallback compatibility.

## 5. Out of Scope

- Provider-specific error-body translations beyond the listed common conditions.
- Changing safe-command whitelist membership or `--no-safe` semantics.

## 6. References

- `IMPROVEMENTS.md` §§6.2 and 6.4
- `src/api/client.js`, `src/agent/agent.js`, `src/tools/handlers/run-command.js`
