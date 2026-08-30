# Plan: Terminal UI overhaul — Pass 1 (Spacing, Rhythm and Readability)

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-25-tui-overhaul` |
| **Status** | `approved` |

---

## 1. Technical Approach

All changes are confined to the rendering layer, preserving the module contracts:

- **`src/ui.js`** (main work): rhythm gaps in `printAssistantResponse`, `printToolSummary` (new box), `printToolsDone`, thinking stream (`startThinkingStream`/`appendThinkingStream`/`endThinkingStream`), `printThinking`, `printConfigBox`, and a one-time blank line before the `promptInput` block. Semantic tool colors via a `tone` field added to `formatToolSummary` details.
- **`src/agent.js`**: replace `spinner.stop('response received', '✓')` with silent `spinner.stop()` (2 call sites).
- **`src/cli.js`**: remove the legacy `pc` remap object; import `C` directly and swap every `pc.*` call to the equivalent `C.*` token.

## 2. Architectural Compliance

- **ADR-0001:** compliant — no new dependencies, no build step, raw ANSI rendering.
- **Architecture doc:** compliant — UI stays isolated in `ui.js`; `agent.js` only changes spinner calls (no UI logic added).
- **Design system:** this plan *implements* the updated `docs/visual-identity.md` (§ layout specs and rhythm rules, synced at closing).

## 3. Security and Threat Model

| Element | Handling |
|----------|------------|
| Command execution and whitelist | Not applicable — no tool handler changes |
| File writes and `resolveSafePath` | Not applicable |
| LLM inputs (prompt injection / tool args) | Tool args rendered through the same dim/truncate path as today; sanitized content unchanged (`sanitizeAssistantOutput` untouched) |
| Secrets (API keys, sessions, exports) | Not applicable — no new output path |
| Controls and negative tests | No ANSI leak without reset; box rows never wrap below 60 cols (truncation); thinking redraw never erases beyond its block |

## 4. Impacted Modules

| Module | Path | Change |
|--------|---------|---------|
| UI rendering | `src/ui.js` | Rhythm gaps, tool box, semantic colors, thinking dimming, assistant box padding/label, config `off` color, prompt gap |
| Agent loop | `src/agent.js` | Silent spinner stop (2 call sites) |
| REPL | `src/cli.js` | Remove `pc` remap → `C.*` |

## 5. Impacted Flags / Slash Commands / Tools

None — visual behavior only.

## 6. Files to Create/Modify

| Action | Path | Notes |
|------|--------------------|-------------|
| Modify | `src/ui.js` | All render components listed above |
| Modify | `src/agent.js` | Spinner stops |
| Modify | `src/cli.js` | `pc` → `C` swap |
| Modify | `test-ui.js` | Extend harness to render a full simulated turn (thinking, response box, tool box, tools done, session bar) |
| Modify | `docs/visual-identity.md` | Sync components + resolve debt items |
| Modify | `docs/roadmap.md`, `CHANGELOG.md`, `features/` | Closing sync |

## 7. Technical Decisions (summary)

1. **Each block owns one leading blank line** (except the prompt, which gets one printed above the first render); blocks never print trailing blanks — this guarantees exactly one gap between adjacent blocks without double blanks.
2. **Tool box is self-contained** (top + rows + bottom printed together): the diff boxes print during execution *after* the summary, so an open/closed box spanning execution would be visually broken by the diffs.
3. **`✓ N tools completed`** stays as a single dim line with a leading gap — it is the only completion signal left after removing `response received`.
4. **Thinking uses `C.muted`** (darker than `dim`-over-fg) for header and content — closer to background per the source analysis.
5. The blank line before the prompt block is printed once before the first render and excluded from the cursor-up redraw math (it must never be erased).

## 8. Verification Strategy and Gates

| AC | Verification |
|----|--------------|
| AC-01 | `grep -n "const pc" src/cli.js` returns nothing; `node --check src/cli.js` |
| AC-02/03/04/06/07/08 | Extended `test-ui.js` harness: render a scripted full turn at 80 and 60 columns, inspect output |
| AC-05 | Code inspection of the 2 spinner call sites + harness |
| AC-09 | Harness renders session bar + prompt gap |
| AC-10 | `node --check` on all touched files + full harness run with ANSI-reset scan |

## 9. Git Workflow

| Item | Answer |
|------|--------|
| **Feature branch** | `feat/tui-overhaul` (created from `docs/engineering-foundation`) |
| **Commit plan** | (1) spec/plan/tasks + ui-improvements input; (2) rhythm + padding + config + prompt gap in `ui.js`; (3) tool box + semantic colors; (4) thinking dimming + spinner noise in `ui.js`/`agent.js`; (5) `pc`→`C` in `cli.js` + harness; (6) docs sync |

## 10. Failures, Partial State and Rollback

| Topic | Strategy |
|------|------------|
| Error handling and user-facing messages | Unchanged |
| Interruption (Ctrl+C / Esc) and readline state | Gap line before prompt printed once before raw mode; redraw math unchanged |
| Partial state (session, undo stack, file cache) | Untouched |
| Rollback / undo | Pure rendering — revert the feature branch commits |

## 11. Technical Risks and Trade-offs

| Risk | Likelihood | Mitigation |
|-------|---------------|-----------|
| Thinking-stream cursor math regression | Medium | Gap lines excluded from the erase count; harness asserts block integrity |
| Tool arg truncation cutting useful info | Low | Truncate with `…` at the inner width; full args already go to the model |
| Two blanks when thinking is followed by a response (both own gaps) | Low | Thinking block prints no trailing blank; the next block's leading blank provides the single gap |
