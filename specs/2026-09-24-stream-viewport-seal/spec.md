# Spec: Seal streamed frames when the viewport cannot be redrawn

| Field | Value |
|-------|-------|
| **ID** | `2026-09-24-stream-viewport-seal` |
| **Status** | `implemented` |
| **Phase/Context** | Agent stream normalization / terminal UI |
| **Related documents** | [PRD](../../docs/product.md), [architecture](../../docs/architecture.md), [visual identity](../../docs/visual-identity.md), [live response streaming](../2026-09-03-live-response-streaming/spec.md), [stale stream prefix dedup](../2026-09-03-stale-stream-prefix-dedup/spec.md) |

## 1. Problem / Motivation

`output-logs.txt` shows the assistant response being printed repeatedly, with each repetition containing the previous one. The stream normalizer and assistant history are correct, but the live renderer redraws the entire accumulated frame on every content delta. Cursor-up redraws can only recall lines that remain in the terminal viewport; a response that scrolls past the viewport, or stdout that is not a TTY, leaves every old frame in the scrollback or capture. The same latent issue existed in expanded thinking output.

The bug began with progressive response streaming (`b5e6c37`) and was not exposed by the original tests because they only checked that a partial line was present and that the response box opened once. The stale-prefix fix (`86f1bea`) addressed provider snapshots and history, not renderer duplication.

## 2. Goal

Preserve progressive rendering whenever the full frame fits in a known TTY viewport, while switching long or non-TTY streams to append-only emission so no received text is rendered more than once.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-----------|---------------------|
| RF-S01 | A response frame MUST use in-place redraw while stdout is a TTY and the frame fits the known viewport. | Must |
| RF-S02 | When stdout is non-TTY or the frame exceeds the viewport, response rendering MUST seal the existing frame and append only newly completed lines. | Must |
| RF-S03 | The final response line MUST be flushed at stream end, and the response box MUST still close exactly once. | Must |
| RF-S04 | Expanded thinking output MUST use the same sealed append-only behavior when its frame cannot be redrawn. | Must |
| RF-S05 | Unknown TTY row height MUST retain the established redraw behavior rather than seal prematurely. | Must |
| RF-S06 | Provider stream normalization, assistant history, tool calls, prompt arbitration, response sanitization and Markdown rendering MUST remain unchanged. | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|----------|
| **Risk classification** | Medium — changes terminal rendering state transitions shared by response and thinking streams. |
| **Assets/secrets** | Not applicable; no persistence, credentials or external data changes. |
| **Command execution / file writes** | Not applicable; no tool or file boundary changes. |
| **Untrusted inputs** | Model text remains untrusted output; existing sanitization and bounded rendering remain in force. |
| **Negative criteria** | Do not duplicate content, silently drop the final line, change history, re-enable unbounded full-frame redraws, or alter provider requests. |

## 5. Out of Scope

- Replacing the ANSI renderer with a full-screen terminal UI framework.
- Changing stream normalization or context compression thresholds.
- Adding semantic duplicate detection for model output.
- Adding new CLI flags, slash commands or dependencies.

## 6. Acceptance Criteria

- **AC-01:** Given a short response on a TTY with a sufficient viewport, content deltas remain progressively visible and the response box opens once.
- **AC-02:** Given a long response captured through non-TTY stdout, the marker appears exactly once and the final paragraph is flushed.
- **AC-03:** Given a long response on a TTY whose viewport is too short, the marker appears exactly once after sealing and the final paragraph is flushed.
- **AC-04:** Given expanded thinking output, the active-turn prompt arbitration test continues to preserve header, reasoning rows and final duration.
- **AC-05:** Focused stream, reasoning and prompt tests pass; the full suite has no regressions attributable to this change, and lint/syntax checks complete.

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|--------|---------------------|
| A terminal exposes TTY status but no row count. | Medium | Preserve prior redraw behavior until a viewport can be measured. |
| The last line is still growing when the frame seals. | Medium | Hold the final line back and flush its final rendering at stream end. |
| Expanded thinking has a different header/footer shape. | Medium | Use the same seal rule, then append the final duration below the sealed block. |
| Full suite has unrelated platform failures. | Low | Report exact failures; do not alter symlink/security tests in this UI fix. |

## 8. References

- `output-logs.txt` — reproduced multiplied response output.
- `src/ui/response.js` — response stream renderer.
- `src/ui/thinking.js` — expanded thinking stream renderer.
- `src/agent/agent.js` — stream lifecycle and single-shot finalization.
- `test/live-response-stream.test.js` — progressive stream coverage.
- `test/live-stream-overflow.test.js` — non-TTY and viewport-overflow regressions.
- `test/thinking-during-active-turn.test.js` — prompt arbitration regression.
