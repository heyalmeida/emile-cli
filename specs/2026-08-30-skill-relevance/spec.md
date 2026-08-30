# Spec: Relevance-gated workspace skills

| Field | Value |
|-------|-------|
| **ID** | `2026-08-30-skill-relevance` |
| **Status** | `implemented` |
| **Phase/Context** | Skills / backlog item 7.2 |
| **Related documents** | [PRD](../../docs/product.md), [Architecture](../../docs/architecture.md), [Security](../../docs/code-quality-and-security.md), [ADR-0001](../../docs/adr/0001-tech-stack-choice.md) |

## 1. Goal

When skills are auto-detected, inject only skills whose name/description matches the user's task, while preserving explicit `-s` selections and always retaining `clean-code`.

## 2. Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| RF-S01 | Auto-detected skills use normalized keyword overlap against the current user prompt. | Must |
| RF-S02 | Explicit skill lists remain authoritative and are not filtered. | Must |
| RF-S03 | `clean-code` remains active for auto-detection. | Must |
| RF-S04 | Existing per-skill and total size caps remain enforced. | Must |

## 3. Risk and Security

| Field | Answer |
|-------|----------|
| **Risk classification** | Medium — changes prompt contents but does not execute tools or write files. |
| **Assets/secrets** | Skill metadata and user prompt; no secrets added. |
| **Untrusted inputs** | Prompt/skill metadata are tokenized as data; no generated token is executed. |
| **Negative criteria** | Explicit skills cannot disappear; irrelevant auto-skills must not be injected solely due to installed dependencies. |

## 4. Acceptance Criteria

- **AC-01:** A React task selects a React skill when it is auto-detected and described.
- **AC-02:** An unrelated task omits the React skill while retaining clean-code.
- **AC-03:** Explicit requested skills are preserved regardless of overlap.
- **AC-04:** Size caps still apply after relevance filtering.

## 5. References

- `IMPROVEMENTS.md` §7.2
- `src/skills.js`, `src/agent/agent.js`, `src/prompt.js`
