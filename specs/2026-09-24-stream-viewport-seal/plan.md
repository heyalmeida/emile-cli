# Plan: Seal streamed frames when the viewport cannot be redrawn

| Field | Value |
|-------|-------|
| **Spec** | `2026-09-24-stream-viewport-seal` |
| **Status** | `implemented` |

## 1. Technical Approach

Keep the existing atomic redraw path for response and expanded thinking blocks when `process.stdout.isTTY` is true and the rendered block fits the available rows. Add a sealed mode at the renderer boundary: once the block is known to be non-TTY or taller than the viewport, retain the lines already written, stop issuing cursor-up redraws, emit only newly completed wrapped lines, and flush the still-growing final line in the end function.

The response stream uses a four-row margin for its box border/padding/headroom. The expanded thinking stream uses a three-row margin for its header/footer/headroom. Unknown TTY row counts preserve the previous redraw behavior.

## 2. Architectural Compliance

- **Relevant ADR(s):** ADR-0001; no new dependency, build step or terminal framework is introduced.
- **Architecture:** the agent loop remains the sole stream lifecycle owner; only the existing `ui/` renderers gain viewport-aware state.
- **Design system:** output remains sanitized, bounded and palette-based; sealing is a terminal-capacity behavior, not a visual redesign.

## 3. Security and Threat Model

| Element | Handling |
|----------|----------|
| Command execution and whitelist | Not applicable; no command path changes. |
| File writes and `resolveSafePath` | Not applicable; no file boundary changes. |
| LLM inputs (prompt injection / tool args) | Not applicable; model stream data is not reinterpreted or persisted differently. |
| Secrets (API keys, sessions, exports) | Not applicable; no new output or persistence path. |
| Controls and negative tests | Existing sanitization remains; non-TTY and viewport-overflow tests assert no duplicate rendering. |

## 4. Impacted Modules

| Module | Path | Change |
|--------|---------|---------|
| Response UI | `src/ui/response.js` | Add viewport detection, sealed append mode and final-line flush. |
| Thinking UI | `src/ui/thinking.js` | Apply the same fallback to expanded live reasoning. |
| Stream tests | `test/live-response-stream.test.js` | Simulate a TTY for progressive redraw coverage. |
| Regression tests | `test/live-stream-overflow.test.js` | Cover non-TTY and short-viewport streams. |

## 5. Impacted Flags / Slash Commands / Tools

None.

## 6. Files to Create/Modify

| Action | Path (expected) | Notes |
|------|--------------------|-------|
| Modify | `src/ui/response.js` | Viewport-aware sealed renderer. |
| Modify | `src/ui/thinking.js` | Viewport-aware sealed expanded renderer. |
| Modify | `test/live-response-stream.test.js` | Fake TTY for the redraw path. |
| Create | `test/live-stream-overflow.test.js` | Regression coverage. |
| Create | `specs/2026-09-24-stream-viewport-seal/{spec,plan,tasks}.md` | SDD record. |

## 7. Technical Decisions (summary)

Cursor-up is an optimization for a bounded frame, not a reliable persistence mechanism. Once a frame can no longer be recalled, the renderer changes from replace-in-place to append-only. The final growing line is held back to avoid reflow duplication, then flushed once at end-of-stream.

## 8. Verification Strategy and Gates

- `node --check src/ui/response.js`
- `node --check src/ui/thinking.js`
- `node --check test/live-response-stream.test.js`
- `node --check test/live-stream-overflow.test.js`
- `node --test test/live-response-stream.test.js test/live-stream-overflow.test.js test/stream-dedup.test.js test/reasoning.test.js test/thinking-during-active-turn.test.js`
- `npm test`
- `npm run lint`

## 9. Git Workflow

No branch or remote operation is performed. The current checkout is on `main`; the repository instructions reserve branch switching and commits for explicit user direction. Only scoped implementation, test and documentation files are changed.

## 10. Failures, Partial State and Rollback

| Topic | Strategy |
|-------|-----------|
| Error handling and user-facing messages | Preserve existing stream error/cancel handling. |
| Interruption (Ctrl+C / Esc) and readline state | Renderer state resets on stream end; existing turn-control behavior is unchanged. |
| Partial state (session, undo stack, file cache) | Not applicable. |
| Rollback / undo | Revert only the scoped renderer/test/spec files if needed. |

## 11. Technical Risks and Trade-offs

| Risk | Likelihood | Mitigation |
|------|-------------|-----------|
| Sealing slightly reduces live granularity for long responses. | Medium | Only happens after redraw is impossible; the response remains complete and single-pass. |
| TTY row count is inaccurate. | Low | Seal conservatively when a known viewport is exceeded; unknown counts retain prior behavior. |
