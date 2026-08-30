# Spec: Terminal UI premium pass (minimal, Claude-Code-grade)

| Field | Value |
|-------|-------|
| **ID** | `2026-08-25-tui-premium` |
| **Status** | `implemented` |
| **Phase/Context** | Phase 1 — UI Overhaul ([roadmap](../../docs/roadmap.md)) — **Pass 2: Premium minimalism** (supersedes parts of pass 1) |
| **Related documents** | [Visual Identity](../../docs/visual-identity.md), [spec pass 1](../2026-08-25-tui-overhaul/spec.md), [ui-premium.md](./ui-premium.md) (source analysis) |

---

## 1. Problem / Motivation

Pass 1 fixed the rhythm and isolation, but the result is still visually heavier than the reference (Claude Code): the tools **box** adds border noise where reference tools are simple aligned lines; two status lines per operation (`✓ N tools completed` + the already-removed `response received`) still accumulate in long sessions; thinking is too present even dimmed (it competes with real content); tool label columns are not grid-aligned; and the assistant box stretches to the full terminal width (120) where a calmer 88-column measure reads better. Full analysis in [`ui-premium.md`](./ui-premium.md).

## 2. Goal

Reach premium minimalism: tool calls as **grid-aligned single lines** (no box), status noise reduced to a single dim `↳ N tools` line above the response, thinking **nearly invisible by default** (ghost one-liner; content only when explicitly expanded), the user message as a **command divider**, and a refined 88-column response box — while keeping the vertical rhythm rule from pass 1.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) | Source |
|----|-----------|---------------------|--------|
| RF-S01 | Tool calls render as aligned single lines: `● exec   git log …` — no box, fixed 8-char lowercase label column, semantic tone color on bullet+label, dim truncated args | Must | ui-premium § 1 |
| RF-S02 | Remove the `✓ N tools completed` footer entirely; instead print one dim `↳ N tools` line above the next assistant response box, then reset the counter | Must | ui-premium § 2 |
| RF-S03 | Thinking nearly invisible by default: collapsed mode shows a ghost one-liner (`··· thinking` while streaming, `··· thought Ns` when done); content renders only in expanded mode (`/thinking` / Ctrl+P) | Must | ui-premium § 3 |
| RF-S04 | Default thinking mode changes from expanded to **collapsed** (opt-in expansion); toggle logic and message updated | Must | ui-premium § 3 |
| RF-S05 | User message renders as a command divider: `── <message> ────────` (muted dashes, fg text, truncated to width) | Must | ui-premium § 6 |
| RF-S06 | Response box refined: max width 88, keeps inner padding and bold accent label from pass 1 | Must | ui-premium § 4 |
| RF-S07 | New palette tokens: `C.gold` (#FFD700 — grep/find, replaces purple per Option A of the source analysis) and `C.ghost` (#3B4261 — near-invisible thinking) | Must | ui-premium § colors |
| RF-S08 | Exported `GAP` spacing constants (none/section/command) used by the modified components | Should | ui-premium § 5 |
| RF-S09 | Config panel `off` dim (already delivered in pass 1 — regression-checked only) | Should | ui-premium § 7 |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|----------|
| **Risk classification** | **Medium** — rendering layer only; changes default behavior of thinking visibility (reversible via `/thinking`) and removes pass-1 UI elements (superseded, not lost) |
| **Assets/secrets** | Not applicable — no new output path exposes keys or raw HTTP bodies |
| **Command execution / file writes** | Not applicable — confined to rendering |
| **Untrusted inputs** | LLM content keeps going through `sanitizeAssistantOutput`; tool args truncated (not executed) at render time |
| **Negative criteria** | (1) No ANSI code may leak without reset; (2) tool lines and divider must not wrap below 60 columns (truncation with `…`); (3) the thinking stream redraw must never erase lines outside its own block |

## 5. Out of Scope

- Persistent context header (ui-premium doesn't request it; remains backlog)
- Interactive selects radio treatment and `/cost` box (still backlog from pass 1)
- Replacing the true-color `C` palette with 256-color codes — the source analysis's 256-color values are **adapted** to the existing true-color token system (visual identity: one palette, one source of truth)
- Refactoring every caller in the codebase to use `GAP` — only the components touched by this spec

## 6. Acceptance Criteria

- **AC-01:** Given tool calls of different kinds, when rendered, then each is a single line `● <label padded to 8><arg>` with no box borders, labels lowercase and grid-aligned, and the tone color on bullet+label (exec=red, read=info, write/edit=warn, grep/find=gold, list=fg).
- **AC-02:** Given a turn with tools followed by a text response, when rendered, then no `✓ … tools completed` line exists and exactly one dim `↳ N tools` line appears above the response box.
- **AC-03:** Given reasoning content in the default (collapsed) mode, when streamed and finished, then only a ghost `··· thinking` / `··· thought Ns` line is visible — no content, no warn color.
- **AC-04:** Given `/thinking` (or Ctrl+P), when toggled, then the mode flips to expanded and reasoning content renders (muted); toggling again returns to the ghost one-liner. The toggle message reports the correct current mode.
- **AC-05:** Given a user message, when rendered, then it appears as `── <message> ────…` (message in fg, dashes in muted, truncated to the terminal width) with the pass-1 rhythm preserved.
- **AC-06:** Given an assistant response, when rendered, then the box is at most 88 columns wide with inner padding rows and the bold accent label.
- **AC-07:** Given the render harness at 80 and 60 columns, when executed, then no line wraps and no ANSI reset is missing.
- **AC-08:** Given `node --check` on all touched files, when run, then all pass.

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|---------|--------------------|
| Collapsed-by-default thinking hides reasoning users were used to seeing | Medium | `/thinking` and Ctrl+P remain instant opt-in; CHANGELOG + README document the new default |
| `↳ N tools` counter logic spans two functions (summary + response) | Low | Module-level counter reset on user message and after printing; history replay uses the same components so it stays consistent |
| Superseding the pass-1 tools box (RF-S03 of that spec) | Low | Deliberate direction change recorded here; pass-1 spec stays `implemented` for its own ACs at the time |

## 8. References

- Source analysis: `ui-premium.md` (in this directory)
- Pass 1: `specs/2026-08-25-tui-overhaul/spec.md`
- Design system: `docs/visual-identity.md`
