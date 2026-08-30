# Spec: Terminal UI overhaul (TUI Overhaul)

| Field | Value |
|-------|-------|
| **ID** | `2026-08-25-tui-overhaul` |
| **Status** | `implemented` (Pass 1 — follow-up passes listed in § 5) |
| **Phase/Context** | Phase 1 — UI Overhaul ([roadmap](../../docs/roadmap.md)) — **Pass 1: Spacing, Rhythm and Readability** |
| **Related documents** | [PRD (RF-14, RF-16)](../../docs/product.md), [Visual Identity](../../docs/visual-identity.md), [Architecture](../../docs/architecture.md), [ADR-0001](../../docs/adr/0001-tech-stack-choice.md), [ui-improvements.md](./ui-improvements.md) (source analysis) |

---

## 1. Problem / Motivation

The current TUI has no visual rhythm: blocks are glued together with no consistent gaps (the user message, thinking block, assistant box, tool output and the input prompt all touch each other), tool calls are loose lines instead of an isolated group, every tool label has the same color, the spinner prints a `✓ response received` line after every API call (pure noise in long sessions), the thinking block renders with the same weight as primary content, the assistant box has no inner padding, and the config panel renders `off` in red (which reads as an error).

The full analysis with terminal screenshots is in [`ui-improvements.md`](./ui-improvements.md) — this spec implements its high-impact items.

## 2. Goal

Give the conversation flow a consistent vertical rhythm (1 blank line between every group), isolate tool calls in their own box, color-code tools by operation risk, demote the thinking block to background noise, remove status noise, and refresh the assistant box padding/label — verifiable by the visual review checklist of the design system.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) | Source |
|----|-----------|---------------------|--------|
| RF-S01 | Remove the legacy `pc.*` remapping in `cli.js`; all user output uses `C.*` from `src/ui.js` | Must | spec / ui-improvements § 5 |
| RF-S02 | Vertical rhythm: exactly 1 blank line between every distinct block (user message, thinking, assistant box, tool box, diff box, session bar/prompt) and 0 between items of the same group | Must | ui-improvements § 8 |
| RF-S03 | Tool calls isolated in their own labeled box (`╭─ tools ─╮`) with gaps before/after | Must | ui-improvements § 2 + user report |
| RF-S04 | Semantic color per tool: Read→info, Write/Edit→warn, Exec→red, Grep/Find→purple, List→muted, plan tools→accent | Must | ui-improvements § 2 |
| RF-S05 | Suppress the `✓ response received` spinner line; keep a single dim `✓ N tools completed` line with a gap before it | Must | ui-improvements § 3 |
| RF-S06 | Thinking block demoted to background: `✻` header and content in `muted` (not `dim`/`warn`), consistent gaps before/after in both expanded and collapsed modes | Must | ui-improvements § 4 |
| RF-S07 | Assistant box: inner vertical padding (blank row top/bottom) and bold accent `emile` label | Must | ui-improvements § 5 |
| RF-S08 | Config panel: `off` states rendered dim (not red); `on` stays green | Should | ui-improvements § 7 |
| RF-S09 | One blank line between the session bar and the input prompt box | Must | user report |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|----------|
| **Risk classification** | **Medium** — rendering layer only; doesn't touch command execution or file writes, but changes the `ui.js` thinking-stream cursor-erase arithmetic (a miscalculation corrupts the terminal display, not data) |
| **Assets/secrets** | Not applicable — no new output path exposes keys or raw HTTP bodies |
| **Command execution / file writes** | Not applicable — change confined to rendering |
| **Untrusted inputs** | LLM content keeps going through `sanitizeAssistantOutput`/interceptor before rendering; no render path bypasses the sanitizer |
| **Critérios negativos** | (1) No ANSI code may leak without reset; (2) box rows must not wrap/break below 60 columns; (3) the thinking stream redraw must never erase lines outside its own block |

## 5. Out of Scope (deferred to future specs)

- Section dividers for slash commands (ui-improvements § 1)
- Radio-style active/inactive treatment in interactive selects (ui-improvements § 6)
- Persistent context header (ui-improvements § 9)
- `/cost` in a box, API error box treatment, full narrow-width audit (original spec draft items — follow-up passes)

## 6. Acceptance Criteria

- **AC-01:** Given `src/cli.js`, when audited, then no local `pc` palette/remap definition exists — all output uses `C.*` imported from `ui.js`.
- **AC-02:** Given a full turn (user message → thinking → response box → tool box → diff → session bar → prompt), when rendered, then every pair of adjacent distinct blocks has exactly one blank line between them, and consecutive tool rows inside the tool box have none.
- **AC-03:** Given a turn with 2+ tool calls, when rendered, then the tool rows appear inside a `╭─ tools ─╮` box, with a blank line before the box and after it.
- **AC-04:** Given tool calls of different kinds (Read, Write, Exec, Grep, List), when rendered, then each label uses its semantic color (info/warn/red/purple/muted respectively).
- **AC-05:** Given a streaming API response, when the first chunk arrives, then no `✓ response received` line is printed — the spinner erases silently.
- **AC-06:** Given reasoning content in expanded and collapsed modes, when rendered, then the header and content use `C.muted` and both modes leave exactly one blank line after the block.
- **AC-07:** Given an assistant response, when rendered, then its box contains a blank inner row above and below the text and the `emile` label is bold accent.
- **AC-08:** Given the config panel with `cache: off` and `safe-gate: off`, when rendered, then `off` appears dim (not red) and `on` appears green.
- **AC-09:** Given the session bar followed by the input prompt, when rendered, then exactly one blank line separates them.
- **AC-10:** Given all touched files, when verified, then `node --check` passes and a scripted render harness (test-ui.js extension) produces all blocks without ANSI leakage into the following lines.

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|---------|--------------------|
| Thinking-stream cursor arithmetic changes when adding gap lines | Medium | Gap lines are printed once above the redrawn block and never counted in the cursor-up math; verified in the render harness |
| Tool box width vs. long args (Exec commands) | Medium | Truncate arg to the remaining inner width with `…` |
| Replacing `pc.*` across `cli.js` (~40 call sites) may change output subtly | Low | The remap already routes to the same `C` palette tokens — mechanical swap verified by `node --check` + harness |

## 8. References

- Documents consulted: PRD (RF-14/RF-16), visual-identity (§ 2-6), architecture (§ 2 modules), ADR-0001
- Source analysis: `ui-improvements.md` (in this directory)
- Related specs: none (first spec in the project's history)
