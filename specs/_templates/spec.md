# Spec: [Short, descriptive title]

| Field | Value |
|-------|-------|
| **ID** | `YYYY-MM-DD-spec-name` |
| **Status** | `draft` |
| **Phase/Context** | E.g., Phase 1 — Foundation / Phase 2 — UI Overhaul |
| **Related documents** | E.g., [PRD](../../docs/product.md), [ADR-0001](../../docs/adr/0001-tech-stack-choice.md) |

---

## 1. Problem / Motivation

*What user pain are we solving? Why now? Reference the PRD (RF-XX) or the roadmap item that justifies it.*

## 2. Goal

*The desired outcome, in one or two measurable sentences.*

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-----------|---------------------|
| RF-S01 | | Must |
| RF-S02 | | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|----------|
| **Risk classification** | Low / Medium / High — justify by the highest possible impact |
| **Assets/secrets** | API keys, user files, exported sessions — or "Not applicable" |
| **Command execution / file writes** | Does the feature touch `runCommand`, tool handlers or writes? How do the gates (safe mode, dry-run, whitelist, `resolveSafePath`) apply? |
| **Untrusted inputs** | LLM output (tool calls), user prompts, contents of read files — how are they validated? |
| **Negative criteria** | What must be explicitly denied or fail closed |

> For high risk, the negative and abuse criteria are mandatory and must reappear in the plan and the tests. See [Code Quality and Security](../../docs/code-quality-and-security.md).

## 5. Out of Scope

*What will explicitly NOT be done in this spec (to avoid scope creep).*

## 6. Acceptance Criteria

*Each criterion must be objectively verifiable (Given/When/Then format when it makes sense).*

- **AC-01:** Given [context], when [action], then [expected result].
- **AC-02:**

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|---------|--------------------|
| | | |

## 8. References

- Product/architecture documents consulted:
- Related specs:
