# Spec: Open boxes — side borders removed, top-border color fixed

| Field | Value |
|-------|-------|
| **ID** | `2026-08-25-tui-open-boxes` |
| **Status** | `approved` |
| **Phase/Context** | Phase 1 — UI Overhaul — **Pass 3: open boxes** (fixes pass 1/2 regressions) |
| **Related documents** | [Visual Identity](../../docs/visual-identity.md), [pass 1](../2026-08-25-tui-overhaul/spec.md), [pass 2](../2026-08-25-tui-premium/spec.md) |

---

## 1. Problem / Motivation

Two defects reported against the boxes shipped in passes 1-2:

1. **Right-side misalignment:** the `│` side borders require right-padding computed from `stripAnsi(line).length`, which is not the true display width (wide/emoji characters count as 1 in JS but render as 2 columns) — so the right border ends up ragged/bugged on the right side of every box.
2. **White top border:** in the response box, the label `C.bold(C.accent('emile'))` ends with an ANSI RESET inside a `C.muted(...)` wrapper — everything after the label (the dashes and closing corner) renders in the terminal's default (white) color.

## 2. Goal

Adopt **open boxes** (top and bottom borders only, no left/right `│`) across every box component, and rebuild all top borders from separately-styled ANSI parts so the entire border renders in `muted` — eliminating both defects at the root.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-----------|---------------------|
| RF-S01 | All boxes render open-style: top border `╭─ label ────` and bottom border `╰────`, no left/right `│` borders | Must |
| RF-S02 | Box content indented 4 spaces under the top border; no right-padding computation anywhere | Must |
| RF-S03 | Top borders render fully in `muted` regardless of the label's color — ANSI parts composed separately, never nested inside a single wrapper | Must |
| RF-S04 | Applies to: response box, config box, help box, diff box, startup/header brand box | Must |
| RF-S05 | Diff rows keep line numbers and add/remove colors; long lines truncated (no wrap) | Must |
| RF-S06 | Markdown code-block rail aligns with the new 4-space content indent | Should |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|----------|
| **Risk classification** | **Low/Medium** — rendering only; no sanitization or tool changes |
| **Negative criteria** | No ANSI leak; no line wrapping below 60 cols; content never touches the left margin (≥2-space indent preserved) |

## 5. Out of Scope

- Thinking, tool lines, dividers (unchanged)
- Session bar and history banner (not boxes)

## 6. Acceptance Criteria

- **AC-01:** Given any box component, when rendered, then no `│` side-border characters appear in its frame.
- **AC-02:** Given the response box top border with the `emile` label, when rendered, then the dashes and corner after the label are `muted` (no default-white segment).
- **AC-03:** Given content with wide/emoji characters inside the response box, when rendered, then no ragged right edge exists (there is no right border to misalign).
- **AC-04:** Given the render harness at 80 and 60 columns, when executed, then every box top/bottom border fits without wrapping and all lines keep the 4-space content indent.
- **AC-05:** Given the diff box, when rendered, then line numbers/colors are preserved and long lines truncate with `…`.
- **AC-06:** `node --check` passes on all touched files.

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|---------|--------------------|
| Diff gutter loses the inner `│` separators | Low | Line numbers keep their own alignment via padStart; visual grouping comes from the top/bottom frame |
| Brand header loses the closed-frame look | Low | Deliberate: one consistent box language across the whole TUI |

## 8. References

- Visual identity (components section — synced at closing), passes 1-2 specs
