# Spec: Aligned multiline tool output

| Field | Value |
|-------|-------|
| **ID** | `2026-08-31-aligned-multiline-tool-output` |
| **Status** | `approved` |
| **Phase/Context** | Phase 2 — Terminal UI reliability |
| **Related documents** | [PRD](../../docs/product.md), [Architecture](../../docs/architecture.md), [Visual identity](../../docs/visual-identity.md), [ADR-0001](../../docs/adr/0001-tech-stack-choice.md) |

## 1. Problem / Motivation

Multiline `runCommand` calls are rendered as one tool row followed by raw
continuation lines. The continuation lines start at column zero, breaking the
tool grid and making heredocs, scripts and chained shell commands difficult to
read.

## 2. Goal

Render every physical line of a multiline tool argument beneath the argument
column of its tool row, with consistent indentation and terminal sanitization.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-----------|---------------------|
| RF-S01 | Multiline tool arguments MUST keep the first line in the existing tool grid and indent continuation lines to the same argument column. | Must |
| RF-S02 | Single-line tool rows MUST retain their current rendering, semantic colors, truncation and spacing. | Must |
| RF-S03 | Continuation lines MUST remain sanitized and bounded by the terminal width; rendering MUST NOT introduce raw terminal controls or accidental unbounded output. | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|----------|----------|
| **Risk classification** | Low — display-only change in the terminal UI; no execution, file or API contract changes. |
| **Assets/secrets** | Tool arguments can contain sensitive data; existing terminal-control sanitization and truncation remain required. |
| **Command execution / file writes** | Not applicable to execution; the renderer only displays already parsed tool-call metadata. |
| **Untrusted inputs** | Tool names and arguments originate from model output; preserve existing sanitization and bounded display behavior. |
| **Negative criteria** | Do not print continuation lines at column zero, leak ANSI/control sequences or change the tool-call payload. |

## 5. Out of Scope

- Changing shell execution or command semantics.
- Reformatting command contents, syntax highlighting or adding a pager.
- Changing tool labels, colors or the single-line grid.

## 6. Acceptance Criteria

- **AC-01:** Given a multiline `runCommand` argument, when the tool summary renders, then every continuation line starts at the same argument column as the first line.
- **AC-02:** Given a single-line tool call, when it renders, then its output remains unchanged apart from the shared implementation path.
- **AC-03:** Given control characters or an oversized argument, when it renders, then existing sanitization and width bounds remain active.

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|---------|-------------------|
| Wide terminal or long heredoc lines may still wrap visually. | Low | Bound each displayed physical line to the existing argument width and use the current ellipsis convention. |

## 8. References

- `src/ui/tool-lines.js`
- `test/mcp-tool-visibility.test.js`
