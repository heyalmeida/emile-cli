# Spec: Complete the retroactive feature registry

| Field | Value |
|-------|-------|
| **ID** | `2026-08-30-feature-registry-completion` |
| **Status** | `implemented` |
| **Phase/Context** | Open-source readiness / backlog item 8.4 |
| **Related documents** | [Feature index](../../features/README.md), [Roadmap](../../docs/roadmap.md), [Contributing](../../CONTRIBUTING.md) |

## 1. Goal

Make every shipped product capability listed in the feature registry with a
product description, source spec, code locations and traceable change history.

## 2. Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| RF-S01 | Register the agent loop, built-in tools, plans mode and context compression. | Must |
| RF-S02 | Each entry uses the feature template and references existing source specs. | Must |
| RF-S03 | The feature index and roadmap accurately reflect registry completion. | Must |
| RF-S04 | Backlog 8.4 is marked delivered and the changelog records the documentation delivery. | Must |

## 3. Risk and Security

| Field | Answer |
|-------|----------|
| **Risk classification** | Low — documentation-only; no runtime or security control changes. |
| **Assets/secrets** | None. |
| **Negative criteria** | No feature may claim a flag, tool or spec that does not exist; all relative links must resolve. |

## 4. Acceptance Criteria

- **AC-01:** Four missing product capabilities have feature files based on the template.
- **AC-02:** The index links every file and each new file references a real source spec.
- **AC-03:** Roadmap and `IMPROVEMENTS.md` no longer report the retroactive registry as open.
- **AC-04:** Markdown link/table checks and the existing test/lint gates remain clean.

## 5. References

- `IMPROVEMENTS.md` §8.4
- `features/_template.md`, `features/README.md`
