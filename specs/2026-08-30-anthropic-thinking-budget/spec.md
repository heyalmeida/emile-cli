# Spec: Native Anthropic thinking budgets

| Field | Value |
|-------|-------|
| **ID** | `2026-08-30-anthropic-thinking-budget` |
| **Status** | `implemented` |
| **Phase/Context** | API reasoning / backlog item 7.3 |
| **Related documents** | [PRD](../../docs/product.md), [Architecture](../../docs/architecture.md), [Security](../../docs/code-quality-and-security.md), [ADR-0001](../../docs/adr/0001-tech-stack-choice.md) |

## 1. Goal

Emit Anthropic's native `thinking` request shape with bounded token budgets when an Anthropic-native provider/model is selected, while preserving OpenRouter's `reasoning` object and the existing OpenAI-compatible mapping elsewhere.

## 2. Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| RF-S01 | Anthropic-native provider/model combinations emit `thinking.type=enabled` and a budget derived from effort. | Must |
| RF-S02 | `none` disables native thinking without sending `reasoning_effort`. | Must |
| RF-S03 | OpenRouter and non-Anthropic compatibility paths remain unchanged. | Must |
| RF-S04 | Budgets are finite, positive and independent of user/model text. | Must |

## 3. Risk and Security

| Field | Answer |
|-------|----------|
| **Risk classification** | Medium — changes outbound API parameters but no file/tool execution. |
| **Assets/secrets** | API request body; no credentials are changed. |
| **Untrusted inputs** | Provider/model identifiers are normalized for capability selection; effort is selected from the CLI's existing bounded choices. |
| **Negative criteria** | Unknown models never receive Anthropic thinking parameters; OpenRouter never receives `reasoning_effort`. |

## 4. Acceptance Criteria

- **AC-01:** Requesty + Anthropic model emits enabled native thinking with the expected budget for low/medium/high/max.
- **AC-02:** Native `none` emits disabled thinking.
- **AC-03:** OpenRouter and non-Anthropic tests retain current shapes.

## 5. References

- `IMPROVEMENTS.md` §7.3
- `src/api/client.js`, `src/models.js`
