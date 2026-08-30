# Spec: Reliable reasoning display across streaming formats

| Field | Value |
|-------|-------|
| **ID** | `2026-08-30-reasoning-details-display` |
| **Status** | `implemented` |
| **Phase/Context** | Phase 1 — UI Overhaul / reasoning display fix |
| **Related documents** | [PRD](../../docs/product.md), [Architecture](../../docs/architecture.md), [Visual Identity](../../docs/visual-identity.md), [REASONING_RENDER_FIX](../../REASONING_RENDER_FIX.md), [OpenRouter reasoning docs](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens) |

## 1. Problem / Motivation

The agent currently reads only `reasoning_content` and `reasoning` from streamed deltas. OpenRouter can instead send structured `reasoning_details` blocks, so supported reasoning from models such as Minimax is silently omitted. The local UI changes also split the live stream and final reasoning block into separate toggles: `/thinking` can report `Expanded` while the live stream remains collapsed, and a streamed response never receives the final `Thought for Ns` duration header. In addition, the expanded header contains a newline inside a colored string while cursor math counts it as one line, causing redraws to overwrite or hide the stream. Finally, the client sends the OpenAI-style `reasoning_effort` to OpenRouter even for models whose catalog supports only the unified `reasoning` object, so the provider may not enable visible reasoning at all.

This breaks PRD RF-03 and US-02: users cannot reliably watch reasoning or confirm its duration. The `openrouter/free` router remains allowed to return no reasoning at all; the UI must not fabricate content in that case.

## 2. Goal

Use one `/thinking`/Ctrl+P visibility state for both live and completed reasoning. The default state is expanded so reasoning is visible without an extra command; the toggle still allows users to collapse it. Enable OpenRouter reasoning through its current unified request object, support legacy and structured streaming formats, show a completed `Thought for Ns` header for expanded streams, and preserve structured reasoning blocks for subsequent tool-call requests.

### Scope update — 2026-08-30

After validating the fix with `minimax-m3:free`, the default visibility was changed from collapsed to expanded at the user's request. This is a presentation default only; provider output remains authoritative and `/thinking`/Ctrl+P still toggles the same state.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-----------|---------------------|
| RF-S01 | Parse streamed `delta.reasoning_details` arrays in addition to `reasoning_content` and `reasoning`. Display only readable `text` and `summary` fields; never render encrypted payload data. | Must |
| RF-S02 | Preserve collected `reasoning_details` on the assistant history message when present, including blocks that have no displayable text, so providers can continue structured reasoning across tool calls. | Must |
| RF-S03 | `config.expandThinking` defaults to `true`; `/thinking` and Ctrl+P toggle the single state used by both live and completed reasoning. The status message must match the actual state. | Must |
| RF-S04 | In expanded streaming mode, the live header finishes as `Thought for Ns` without duplicating the full reasoning block. In collapsed mode, only `··· thinking` → `··· thought Ns` is shown. | Must |
| RF-S05 | If the provider emits no reasoning, including `openrouter/free` responses without reasoning, no fabricated reasoning text or duration is displayed. Normal text/tool output remains unaffected. | Must |
| RF-S06 | For OpenRouter, send the unified `reasoning` request object with the selected effort (`min` mapped to `minimal`, `max` preserved), and use `effort: none` to disable reasoning; retain the existing generic parameter behavior for other providers. | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|----------|
| **Risk classification** | Medium — changes the agent streaming/history contract and renders provider-supplied model output. |
| **Assets/secrets** | Reasoning may contain model-generated text; it must use the existing assistant-output sanitizer. API keys and configuration are not touched. |
| **Command execution / file writes** | Not applicable — no tool handler or filesystem gate changes. |
| **Untrusted inputs** | `reasoning`, `reasoning_content` and `reasoning_details` are provider/LLM output. Validate field types, ignore unknown/non-text display fields, sanitize visible text before terminal rendering, and preserve raw structured blocks only in the existing in-memory/session message flow. |
| **Negative criteria** | Encrypted `data`/`encrypted_content` fields must never be displayed; malformed details must not crash the stream; a provider that returns no reasoning must not receive fabricated content. |

## 5. Out of Scope

- Selecting or forcing a reasoning-capable model behind `openrouter/free`.
- Changing provider pricing, reasoning budgets, or reasoning behavior for non-OpenRouter providers.
- Exposing encrypted reasoning or reconstructing hidden chain-of-thought that the provider did not return.
- Redesigning the terminal reasoning palette or box layout.

## 6. Acceptance Criteria

- **AC-01:** Given a stream with `delta.reasoning_content`, `delta.reasoning`, and `delta.reasoning_details` text/summary blocks, when parsed, then all readable reasoning is rendered in order.
- **AC-02:** Given structured details containing encrypted blocks, when parsed, then readable text/summary is shown but encrypted data is not present in terminal output.
- **AC-03:** Given structured details followed by a tool call, when the assistant message is assembled, then the complete `reasoning_details` array is preserved for the next API request.
- **AC-04:** Given `/thinking` or Ctrl+P, when toggled, then both live streaming and completed reasoning use the same expanded/collapsed state and the status text matches it.
- **AC-10:** Given a fresh configuration without an explicit persisted visibility setting, when a turn starts, then reasoning is expanded by default and the live stream is visible.
- **AC-05:** Given expanded streamed reasoning, when the stream ends, then its header reads `Thought for Ns` and the reasoning is not printed twice; given collapsed reasoning, only the ghost indicator and final duration line are visible.
- **AC-06:** Given a response from `openrouter/free` with no reasoning fields, when rendered, then no fake thought content or duration is emitted and the normal response/tool lines still render.
- **AC-07:** Given malformed or non-text `reasoning_details`, when streamed, then the turn continues without an uncaught exception and no unsafe payload is rendered.
- **AC-08:** Given expanded streamed reasoning with multiple redraws, when the stream starts and ends, then the header occupies one physical row, content remains visible, and the final duration rewrite stays on that header row.
- **AC-09:** Given OpenRouter with effort `low`, `high`, `max`, `min` or `none`, when a request is built, then it uses the unified `reasoning` object with the documented effort mapping and does not send `reasoning_effort`.

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|---------|--------------------|
| A provider repeats structured blocks instead of sending deltas | Medium | Accumulate blocks by stable id/index and append text fragments in stream order; preserve the normalized sequence. |
| OpenRouter rejects a legacy or unsupported reasoning parameter | High | Build the provider-specific unified `reasoning` object and unit-test that the unsupported `reasoning_effort` field is absent. |
| `openrouter/free` chooses a non-reasoning model | Low | Treat absent reasoning as valid provider behavior; document that `/thinking` controls visibility only. |
| Rewriting the live header may disturb cursor position | Medium | Update only the known thinking block header and verify with the existing UI harness plus narrow-width checks. |

## 8. References

- Product/architecture documents consulted: PRD RF-03, architecture agent-loop invariants, visual identity thinking-stream rules, `IMPROVEMENTS.md` §7.4.
- Related specs: `specs/2026-08-25-tui-premium`, `specs/2026-08-25-tui-overhaul`.
