# Spec: Context-aware history compression

| Field | Value |
|-------|-------|
| **ID** | `2026-08-25-context-aware-compression` |
| **Status** | `implemented` |
| **Phase/Context** | Phase 3 — Agent robustness |
| **Related documents** | [PRD](../../docs/product.md), [Architecture](../../docs/architecture.md), [ADR-0001](../../docs/adr/0001-tech-stack-choice.md), [Model system](../2026-08-25-model-system/spec.md), [Dynamic model catalog](../2026-08-25-dynamic-model-catalog/spec.md) |

---

## 1. Problem / Motivation

The context status correctly reports the active model's catalog window, but the
history-compression gate independently uses a fixed raw-character threshold:
40,000 characters for free routes and 120,000 for paid routes. As a result, a
model such as Ox Alpha with a 1,048,576-token window can compress around 50k
tokens even though the UI reports roughly 5% context usage.

The two paths must use the same model metadata and token unit so the displayed
quota and the compression decision cannot materially disagree.

## 2. Goal

Trigger context compression only when the estimated request payload reaches
80% of the active model's real context window, while retaining enough recent
messages and preventing repeated compression without meaningful history growth.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-------------|---------------------|
| RF-S01 | Resolve the compression limit from the same model context metadata used by context tracking. | Must |
| RF-S02 | Compare tokens to tokens: use the complete pre-call context estimate, including compressed secondary system messages, and compress at 80% of the active window. | Must |
| RF-S03 | Preserve the existing minimum-history gate and safe assistant/tool-pair split. | Must |
| RF-S04 | After a successful compression, require more than 40% growth from the compressed history size before another compression attempt on that message list. | Must |
| RF-S05 | Compression failures must remain non-fatal and must not arm the growth hysteresis. | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|--------|
| **Risk classification** | Medium — an incorrect boundary can either discard useful conversational detail too early or allow an API context overflow. |
| **Assets/secrets** | Conversation history is summarized in memory through the already configured model; no new persistence or logging is introduced. |
| **Command execution / file writes** | Not applicable. No tool handler, shell command, safe-mode gate, path resolver or file write changes. |
| **Untrusted inputs** | Message contents and remote model metadata influence only numeric sizing and the existing summarization request. Numeric inputs must fall back to known model metadata when invalid. |
| **Negative criteria** | Do not compress a 50k-token payload for a 1,048,576-token model; do not bypass the minimum message count; do not re-compress without more than 40% post-compression history growth; do not fail the turn when summarization fails. |

## 5. Out of Scope

- Provider-specific tokenizers or a new tokenization dependency.
- A user-configurable compression ratio or CLI flag.
- Compression between tool calls inside one agent-loop turn.
- Changes to the summarization prompt or retained-message count.

## 6. Acceptance Criteria

- **AC-01:** Given a model window of 1,048,576 tokens and a 50k-token payload,
  when the gate runs with more than eight messages, then no summarization call
  occurs.
- **AC-02:** Given a valid model context window, when the full estimated payload
  reaches 80% of that window, then compression runs; immediately below the
  boundary it does not.
- **AC-03:** Given no explicit payload estimate, when the gate runs, then it uses
  a conservative character-to-token fallback and the model metadata rather than
  the former paid/free character thresholds; full-payload estimation counts a
  compressed secondary system message instead of treating it as the primary
  system prompt.
- **AC-04:** Given a successful compression, when the same message list crosses
  the token boundary again without more than 40% history growth, then it is not
  compressed again; after sufficient growth it is eligible.
- **AC-05:** Given a summarization failure, when the gate runs again at the
  boundary, then the failure remains non-fatal and the retry is not blocked by
  hysteresis.

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|--------|--------------------|
| Character estimates vary by language and code density. | The real request may be closer to the limit than estimated. | Keep a 20% reserve and prefer the full payload estimate over history-only sizing. |
| Live catalog metadata may be absent or malformed. | The gate could use an invalid threshold. | Validate numeric values and fall back through `getModelInfo()`, whose safe default is 128k. |
| Hysteresis could suppress all later compression. | Long sessions could overflow after one compression. | Record the post-compression history size, not the pre-compression size. |

## 8. References

- Product/architecture documents consulted: `README.md`, `docs/product.md`,
  `docs/architecture.md`, `docs/code-quality-and-security.md`,
  `docs/glossary.md`, `docs/roadmap.md`, `docs/adr/0001-tech-stack-choice.md`.
- Related specs: `2026-08-25-model-system`,
  `2026-08-25-dynamic-model-catalog`, `2026-08-25-project-structure`,
  `2026-08-25-dynamic-terminal-title`.
