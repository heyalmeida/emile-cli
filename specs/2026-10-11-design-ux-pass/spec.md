# Spec: Design & UX pass with grok-build as the design base

| Field | Value |
|-------|-------|
| **ID** | `2026-10-11-design-ux-pass` |
| **Status** | `draft` (Phase 1 delivered — awaiting the user's approval before Stage A) |
| **Phase/Context** | Wave 3 — design language (deep-dive backlog **P1-18**), after the robustness work (P1-14/15/16) |
| **Related documents** | [deep-dive § 6, § 19, § 22](../../docs/deep-dive.md), [visual identity](../../docs/visual-identity.md), [architecture](../../docs/architecture.md), [ADR-0001](../../docs/adr/0001-tech-stack-choice.md), [ADR-0003](../../docs/adr/0003-active-prompt-output-arbitration.md), [`specs/2026-10-10-ui-commit-frontier`](../2026-10-10-ui-commit-frontier/spec.md), [`specs/2026-10-10-frame-transition-flicker`](../2026-10-10-frame-transition-flicker/spec.md) |

---

## 1. Problem / Motivation

The user's request was explicitly not a bug hunt: *"melhor design, melhor UX e afins. Não só correção de bugs."* emile's UI **works** and its robustness invariants are now in place (print-once commit frontier, viewport-budgeted frame, DEC 2026 atomic transitions, one clamp), but its **design language** is thinner than the reference pager's:

- the palette is 12 **hues** (`accent`, `gold`, `info`…) documented by convention, not 13 **roles** (`accent_user`, `accent_running`, `accent_skill`…), so a new component picks a color by taste instead of by meaning;
- a batch of 20 file reads prints **20 rows** plus `↳ 20 tools`, where the reference prints one `Read 20 files` line;
- there is **no discoverability layer**: no hint bar, no cheatsheet, and a collapsed thinking block gives no hint that it can be reopened;
- errors are a flat dim one-liner (`✗ Stream error: <detail>`) even though the *content* is already classified and redacted;
- there is no single status line for a turn (activity, phase timer, elapsed, tokens, cancel), so the spinner row and the prompt footer carry different halves of the same story;
- transcript prose is **boxed** (top/bottom borders) while the reference reserves borders for the composer, selection and modals;
- the markdown renderer's emphasis rules are implemented but not written down (`**bold**` → bold, `*italic*` → `C.dim`, headings → accent/bold, inline code → `C.info`), so they cannot be reviewed or held stable.

This phase decides **what** to change, with verified evidence, before any code is touched.

## 2. Goal

`specs/2026-10-11-design-ux-pass/audit.md` gives a per-idea verdict (adopt / adapt / skip) for each of the reference's ten design decisions plus its documented anti-patterns, each with verified `file:line` evidence, a before → after proposal naming its cost and files, and a closing prioritized list and open questions — after which **the user approves or edits before Stage A starts**.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-----------|---------------------|
| RF-S01 | Every reference citation in the audit is re-verified against `C:\Users\mc33p\Documents\GitHub\grok-build`; a claim that does not verify is dropped and the fact is stated in the audit. | Must |
| RF-S02 | One section per reference idea (1–10) plus one for the anti-pattern rules, each with exactly four labeled parts: **Reference** (decision + verified evidence + the principle in one sentence), **Emile today** (`src/ui/...:line` + the matching `visual-identity.md` row or "not present"), **Proposal** (before → after with an ASCII sketch, plus cost: rows/columns, keys, tokens, files), **Verdict** (`adopt` / `adapt` / `skip` with the reason). | Must |
| RF-S03 | The document closes with a prioritized proposal list P0→P3 (ordered by user-visible payoff per unit of risk) and the open questions where taste or product direction decides, each phrased as a concrete either/or. | Must |
| RF-S04 | No proposal adds a dependency, a build step, TypeScript, a Rust component, or a new color/animation that is not tied to a named user-visible problem. | Must |
| RF-S05 | No proposal breaks an existing invariant: the print-once frontier (expansion APPENDS, it never repaints a committed block), the DEC 2026 wrapper, the frame height budget, the viewport clamp, the ADR-0003 stdout lease, the vertical-rhythm rule, or the open-box/right-padding rule. | Must |
| RF-S06 | The stage plan A–F is recorded (one session each) and the audit may reorder it only with a stated reason. | Must |
| RF-S07 | Phase 1 touches no code: only `specs/2026-10-11-design-ux-pass/` and the CHANGELOG's Docs registration entry. | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|----------|
| **Risk classification** | **Low for Phase 1** (a document: no code, no rendering, no behavior change). The *stages it proposes* are Medium — every one of them renders to the terminal — and each will need its own spec, gates and hygiene discussion. |
| **Assets/secrets** | Not applicable — no credential, session or memory surface. The audit deliberately does **not** quote session content or prompts. |
| **Command execution / file writes** | Not applicable — no runtime path; nothing is written outside `specs/`. |
| **Untrusted inputs** | Not applicable. Proposals that touch rendering of model output keep the existing sanitizers (`sanitizeAssistantOutput`, `stripTerminalControls`) and the error-redaction boundary (`formatApiError`); one proposal (error banner) explicitly keeps the redaction as a precondition. |
| **Negative criteria** | The audit must not propose a design that hides information the user needs (e.g. hiding cost is only proposed below a named threshold, following the reference's `MIN_DISPLAYED_COST_USD`), must not fabricate values (`0`/`$0.00` for unknown), and must not make the UI louder without a named problem. |

## 5. Out of Scope

- **Any code change**: Phase 1 is a document (Rule 6.2 — findings are reported, never fixed in passing).
- The **system prompt / capability policy** (P1-17), the **streaming flicker** (P1-16, already landed), the **crash path** (P1-15, landed), **provider behavior**, and the **permission-rules design** (P2-15) — Stage D may only *note* the overlap.
- Re-doing what already landed: the single palette source, semantic tool colors, the user-message divider, thinking expanded/collapsed states, the windowed prompt with elision markers, DEC 2026 atomic frames, the print-once frontier.
- New dependencies, build steps, TypeScript, Rust components, or a TUI framework.
- Product scope: no new command, tool, provider or mode is proposed; only the presentation of what exists.

## 6. Acceptance Criteria

- **AC-01:** `specs/2026-10-11-design-ux-pass/{spec,plan,tasks}.md` exist and follow the templates.
- **AC-02:** `audit.md` covers all ten reference ideas plus the anti-pattern rules, each with the four labeled parts, and every reference citation was verified in the tree (RF-S01).
- **AC-03:** Each proposal states before → after and names its cost in rows/columns, keys and tokens, and the files/modules it touches.
- **AC-04:** Every `skip` carries a reason, and no skipped idea is revisited later in the document.
- **AC-05:** The prioritized list and the open questions close the document.
- **AC-06:** `git status` shows no modified file outside `specs/2026-10-11-design-ux-pass/` and the CHANGELOG Docs entry.

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|---------|--------------------|
| The audit proposes changing a **documented contract** (visual-identity's open-box rule) rather than only adding to it. | Rule 0: the doc is the source of truth, so a silent change would be a bug. | Idea 4/5 is presented as an explicit either/or in the Open Questions, with the constraint analysis (a **left-only** rail needs no right-padding math, so it is compatible with the rule that killed side rails). No stage may implement it before the user answers. |
| "Better design" is subjective; a stage could churn the UI without improvement. | Wasted effort, worse UX. | Every proposal names the **user-visible problem** it solves and its row cost; the audit ends with the taste questions instead of deciding them. |
| Row cost is easy to under-estimate in a print-once terminal (a new row is permanent). | Scrolling noise. | Each proposal states its row delta explicitly, and prefers replacing a row over adding one (hint bar rides the footer, turn status replaces the spinner row). |
| Expansion cannot repaint a committed block (print-once frontier). | Idea 7 (in-situ `›` swap) is not portable as written. | Recorded as an `adapt`: the hint ships inside the collapsed line, and expansion APPENDS a new block below. |
| The audit's stage plan overlaps P2-15 (permission rules) at Stage D. | Duplicated work. | Noted in Stage D with the boundary: Stage D owns *copy and states*, P2-15 owns *the rule engine*. |

## 8. References

- Design contract: `docs/visual-identity.md` (principles § 1, palette § 2, components § 3, interaction § 4, debt § 5, checklist § 6).
- Reference (all citations verified 2026-10-11 against `C:\Users\mc33p\Documents\GitHub\grok-build`): `xai-grok-pager-render/src/theme/mod.rs:1`, `.../theme/tokyonight.rs:55-101`, `.../theme/terminal_default.rs:12-18`, `xai-grok-pager/src/scrollback/layout.rs:15-43`, `.../scrollback/block.rs:40-197`, `.../scrollback/blocks/user.rs:188-227,263-271`, `.../scrollback/blocks/agent.rs:180`, `.../views/shortcuts_bar.rs:1-34`, `.../views/shortcuts_help.rs:1-15`, `xai-grok-pager-render/src/appearance/config.rs:114-123`, `xai-grok-pager/src/scrollback/blocks/thinking.rs:16-44`, `.../scrollback/blocks/tool/mod.rs:71-145`, `.../scrollback/state/verb_group.rs:1-10,71-145`, `.../scrollback/render.rs:444`, `.../views/turn_status.rs:1-37`, `.../app/error_display.rs:1-3,75-96`, `.../views/status_line/segments.rs:18`, `.../scrollback/blocks/session_event.rs:375-379`, `.../notifications/title.rs:18`, `xai-grok-pager-render/src/glyphs.rs:1-7`.
- Brief: `specs/2026-10-08-deep-dive-backlog/briefs/p1-18-design-ux-pass.md`.
- Related specs: `specs/2026-10-10-frame-transition-flicker` (the transition vocabulary this builds on), `specs/2026-08-25-tui-premium` (pass 2 — the last design pass).