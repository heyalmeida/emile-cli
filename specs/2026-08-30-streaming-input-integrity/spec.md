# Spec: Streaming and multiline input integrity

| Field | Value |
|-------|-------|
| **ID** | `2026-08-30-streaming-input-integrity` |
| **Status** | `implemented` |
| **Phase/Context** | Phase 2 — TUI reliability and reasoning stream |
| **Related documents** | [PRD](../../docs/product.md), [Architecture](../../docs/architecture.md), [Visual identity](../../docs/visual-identity.md), [Code quality](../../docs/code-quality-and-security.md) |

## 1. Problem / Motivation

Some providers emit reasoning snapshots that contain all text received so far, while the agent treats every value as a new delta. This duplicates words and makes the expanded thinking stream appear to move backward. Separately, the input redraw writes many partial terminal frames, causing visible flicker, and `Shift+Enter` is currently handled as a normal submit.

## 2. Goal

Make reasoning output monotonic and non-duplicated, make input redraw atomic enough to avoid visible repaint flicker, and allow `Shift+Enter` to insert a newline without sending the prompt.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-----------|---------------------|
| RF-S01 | Cumulative reasoning snapshots MUST be converted to only their unseen suffix before rendering and persistence. | Must |
| RF-S02 | Structured reasoning details with repeated ids/indexes MUST append only newly received text, preserving complete blocks for the next request. | Must |
| RF-S03 | Each input redraw MUST be emitted as one assembled terminal write so partial frames do not visibly flash between keystrokes. | Must |
| RF-S04 | `Shift+Enter` MUST insert a newline at the current cursor position; plain Enter MUST retain submit behavior. | Must |
| RF-S05 | Input and reasoning cleanup MUST preserve raw-mode/listener state and remain safe at narrow terminal widths. | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|----------|
| **Risk classification** | Medium — changes the agent stream contract and raw terminal interaction, but does not change tool permissions or file boundaries. |
| **Assets/secrets** | Reasoning text may be persisted in active memory/session flow; no new secret output is introduced and encrypted reasoning remains undisplayed. |
| **Command execution / file writes** | Not applicable; tool dispatch and file gates are unchanged. |
| **Untrusted inputs** | Provider stream fields and terminal key sequences are treated as untrusted data; only validated text fragments are appended/rendered. |
| **Negative criteria** | Never duplicate a cumulative snapshot, never submit on Shift+Enter, never leave stdin raw after cleanup, and never emit raw encrypted reasoning payloads. |

## 5. Out of Scope

- Changing provider request parameters or adding provider-specific endpoints.
- Rewriting the complete TUI layout or replacing the existing readline/raw-mode architecture.
- Exposing hidden/encrypted reasoning content.

## 6. Acceptance Criteria

- **AC-01:** Given reasoning snapshots `"The user"` then `"The user asks"`, when processed, then the rendered/persisted result is `"The user asks"` without repeated `"The user"`.
- **AC-02:** Given repeated structured detail ids whose text grows cumulatively, when processed, then the target block and display contain each character once.
- **AC-03:** Given ordinary typed characters, when the input redraws, then its frame is assembled before output and the visible prompt remains stable without duplicate rows.
- **AC-04:** Given a `Shift+Enter` keypress, when the prompt is active, then a newline is inserted; given plain Enter, the prompt is submitted.
- **AC-05:** Given a 60-column terminal or cancellation, when the input/reasoning stream ends, then wrapping and raw-mode cleanup remain correct.

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|--------|--------------------|
| A provider may alternate delta and snapshot formats. | Medium | Use prefix/duplicate/overlap detection per accumulated stream and test both formats. |
| Terminal implementations encode Shift+Enter differently. | Medium | Handle Node's `key.shift` event and kitty-style `CSI ... u` sequence where exposed by readline. |

## 8. References

- Related specs: `specs/2026-08-25-prompt-multiline-fix`, `specs/2026-08-30-model-search-picker`, `specs/2026-08-30-anthropic-thinking-budget`.
