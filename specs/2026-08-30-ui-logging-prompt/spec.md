# Spec: UI-owned logging and unified prompt language

| Field | Value |
|-------|-------|
| **ID** | `2026-08-30-ui-logging-prompt` |
| **Status** | `implemented` |
| **Phase/Context** | Architecture & code structure / backlog items 2.4 and 2.5 |
| **Related documents** | [PRD](../../docs/product.md), [Architecture](../../docs/architecture.md), [Visual identity](../../docs/visual-identity.md), [Code quality](../../docs/code-quality-and-security.md), [ADR-0001](../../docs/adr/0001-tech-stack-choice.md) |

## 1. Problem / Motivation

Runtime modules still render status/error output with direct `picocolors` imports or raw ANSI helpers, while the system prompt mixes Portuguese and English in its coding instructions. This creates visual drift and inconsistent model instructions. This implements `IMPROVEMENTS.md` §§2.4–2.5 without changing user-facing behavior beyond palette/language consistency.

## 2. Goal

Route runtime status rendering in agent, compression, plans and API modules through the canonical UI palette/log surface, and make the base system prompt entirely English while preserving its rules and meaning.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-----------|---------------------|
| RF-S01 | No touched non-UI module imports `picocolors` for user-facing output or defines duplicate color helpers. | Must |
| RF-S02 | Agent, compression, plans and API notices retain their current semantic colors and messages through `C`/`ui/log.js`. | Must |
| RF-S03 | The base system prompt's coding/task instructions use one language (English) and preserve all safety/verification requirements. | Must |
| RF-S04 | No command, tool gate, API payload, retry behavior or prompt cache key changes except the intended wording normalization. | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|----------|
| **Risk classification** | Medium — cross-module rendering and system prompt changes can affect terminal output and model behavior. |
| **Assets/secrets** | API keys and workspace content remain untouched; only static UI strings and prompt instructions change. |
| **Command execution / file writes** | Not applicable; tool handlers and execution gates are unchanged. |
| **Untrusted inputs** | Error messages remain interpolated through existing output paths; no new input is trusted or executed. |
| **Negative criteria** | No raw ANSI/picocolors output outside UI; no Portuguese fragments remain in the base prompt; no secrets appear in notices. |

## 5. Out of Scope

- Changing the palette, terminal layout, retry policy or provider request formats.
- Translating user-authored project rules or model/user conversation content.
- Adding a lint dependency or formatter.

## 6. Acceptance Criteria

- **AC-01:** Given the touched runtime modules, when searched, then no direct `picocolors` import or duplicate color helper remains for user-facing output.
- **AC-02:** Given retry, compression, loop, plan-cancel and stream-error paths, when rendered, then semantic colors/messages remain available through the UI palette.
- **AC-03:** Given the base prompt, when inspected, then coding/task instructions contain no Portuguese phrases and still include read-before-write, safe execution, verification and refusal rules.
- **AC-04:** Given the existing test suite and UI harness, when run, then all tests pass and no ANSI leakage/regression is introduced.

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|---------|--------------------|
| Importing the full UI barrel introduces a cycle | Medium | Import `C` from `ui/theme.js` or the minimal `ui/log.js` surface only. |
| Translation subtly changes instruction meaning | Medium | Preserve the bullet structure and translate only the Portuguese sentences. |

## 8. References

- `IMPROVEMENTS.md` §§2.4–2.5
- Existing `src/ui/theme.js`, `src/ui/log.js` and `src/prompt.js`.
