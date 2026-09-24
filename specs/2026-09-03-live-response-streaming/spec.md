# Spec: Live response streaming with continuous turn feedback

| Field | Value |
|-------|-------|
| **ID** | `2026-09-03-live-response-streaming` |
| **Status** | `implemented` |
| **Phase/Context** | Agent loop / TUI feedback |
| **Related documents** | [PRD](../../docs/product.md), [architecture](../../docs/architecture.md), [visual identity](../../docs/visual-identity.md), [Code Quality and Security](../../docs/code-quality-and-security.md) |

## 1. Problem / Motivation

The current agent waits for a complete assistant text response before calling `printAssistantResponse`, so providers that emit text slowly can leave the user with a spinner and then a long period of no visible response. The same happens when a stream contains metadata-only chunks: the spinner can be stopped before any user-facing signal is rendered. The CLI is working, but the terminal does not communicate that state, making the process feel frozen (PRD RF-03, RF-14).

The existing thinking stream already renders reasoning incrementally. The response path needs the same progressive feedback while preserving the final response box, Markdown styling, active-turn prompt arbitration, cancellation and history semantics.

## 2. Goal

Render assistant text as it arrives, keep a visible waiting indicator until the first meaningful reasoning, text or tool-call signal, and end the streamed response cleanly without duplicating the final response or regressing `/undo`, session persistence, cancellation or terminal-width behavior.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-----------|--------------------|
| RF-S01 | Assistant `content` deltas MUST be rendered progressively in the active response block, not held until the stream closes. | Must |
| RF-S02 | The waiting spinner MUST remain active for metadata-only or otherwise non-visible chunks and MUST stop when reasoning, visible text or tool-call output starts. | Must |
| RF-S03 | The progressive response MUST use the existing Tokyo Night response-box layout, sanitization, wrapping and Markdown renderer, and MUST close with the normal open-box bottom. | Must |
| RF-S04 | A streamed response MUST be finalized exactly once and MUST NOT be printed again by the post-stream response path. | Must |
| RF-S05 | A turn that ends with no visible reasoning, text or tool calls MUST keep the existing `· (empty response)` behavior. | Must |
| RF-S06 | Cancellation and stream errors MUST retain their current user-facing messages, close any partial response block, and never produce an empty-response notice. | Must |
| RF-S07 | The change MUST add no dependency and MUST preserve the active-turn prompt, 60/80/120-column rendering and history contract. | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|----------|
| **Risk classification** | Medium — changes the agent stream/rendering contract and renders provider output incrementally. |
| **Assets/secrets** | No new persistence or credential surface; existing session export behavior is unchanged. |
| **Command execution / file writes** | Not applicable; the change only coordinates existing tool calls and response rendering. |
| **Untrusted inputs** | Provider text remains untrusted model output and is passed through the existing assistant sanitizer before rendering. No prompt, command or tool argument is exposed by the new status text. |
| **Negative criteria** | No duplicate final response, no stale response block, no empty-response message after cancel/error, no ANSI leakage, no unbounded redraw or new dependency. |

## 5. Out of Scope

- Streaming Markdown syntax as semantically complete Markdown while it is still incomplete; the existing renderer is used over the growing safe text and the final block is the normal rendered response.
- A new spinner animation library, progress protocol or new CLI flag.
- Changing the provider SDK, retry policy, tool execution, session format or undo behavior.

## 6. Acceptance Criteria

- **AC-01:** Given a stream that yields `content: 'Par'`, pauses, then yields `content: 'tial'`, when the first chunk is consumed, then the terminal already contains `Par` before the stream is released.
- **AC-02:** Given a content stream, when it finishes, then exactly one complete response block is present and the final history message contains the full concatenated content.
- **AC-03:** Given a stream containing only usage/empty chunks, when chunks arrive, then the waiting spinner remains until the stream ends and the existing empty-response notice is shown once.
- **AC-04:** Given a reasoning stream, when the response renderer is used, then reasoning remains a separate live block and the final thinking header is not duplicated.
- **AC-05:** Given cancellation or a stream error after partial content, when the turn ends, then the partial response is closed and only the existing cancel/error signal is added.
- **AC-06:** Given a tool-call-only stream, when the stream finishes, then the response block is not opened and the existing tool summary/loop behavior remains unchanged.
- **AC-07:** `node --check` passes for all touched JavaScript files, the focused streaming tests pass, `npm test` and `npm run lint` pass, and a smoke launch is recorded in `tasks.md`.

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|--------|-----------------|
| Re-rendering a long growing response can create excessive terminal writes. | Medium | Reuse the bounded response layout, redraw only the response rows and retain the existing terminal-width cap; profile with long streamed content. |
| A provider sends reasoning after visible text. | Low | Finalize the thinking block before response streaming begins; preserve reasoning in history and use the existing finalization path. |
| Non-TTY output may receive cursor-control sequences. | Low | Follow the existing TUI convention and verify the non-TTY path does not crash; do not introduce a separate renderer. |

## 8. References

- `src/agent/agent.js` — stream consumption and response finalization.
- `src/ui/response.js` — existing final response-box renderer.
- `src/ui/thinking.js` — progressive reasoning lifecycle.
- `src/ui/spinner.js` — waiting indicator.
- `docs/visual-identity.md` §1, §3 and §6 — state visibility, response layout and UI gates.
- `specs/2026-09-02-empty-stream-line` — empty-stream notice behavior.
