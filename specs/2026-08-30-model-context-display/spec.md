# Spec: Human-readable model context labels

| Field | Value |
|-------|-------|
| **ID** | `2026-08-30-model-context-display` |
| **Status** | `implemented` |
| **Phase/Context** | Phase 2 — Model picker usability |
| **Related documents** | [PRD](../../docs/product.md), [Visual identity](../../docs/visual-identity.md), [Model System](../../features/model-system.md) |

## 1. Problem / Motivation

The `/model` picker currently converts every context window to thousands of tokens. A 1,000,000-token window is therefore displayed as `1000k`, which is harder to read than the conventional `1M` notation.

## 2. Goal

Display context windows of one million tokens or more using an `M` suffix while retaining `k` for smaller windows.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-----------|---------------------|
| RF-S01 | A context of exactly 1,000,000 tokens MUST display as `1M ctx`. | Must |
| RF-S02 | Contexts below one million MUST retain the existing rounded `k ctx` display. | Must |
| RF-S03 | Invalid or non-positive context metadata MUST continue to display `context n/a`. | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|----------|
| **Risk classification** | Low — presentation-only change to already validated metadata. |
| **Assets/secrets** | Not applicable; no credentials or user files are rendered. |
| **Command execution / file writes** | Not applicable. |
| **Untrusted inputs** | Remote catalog metadata remains guarded by numeric validation. |
| **Negative criteria** | Do not change context limits used for API or compression decisions; only the display label changes. |

## 5. Out of Scope

- Changing model context calculations, pricing, catalog fetching or compression thresholds.
- Adding decimal units such as `1.5M`; the display uses rounded whole `M`/`k` values consistent with the existing label.

## 6. Acceptance Criteria

- **AC-01:** Given `context: 1_000_000`, when a catalog label is formatted, then it contains `1M ctx` and not `1000k ctx`.
- **AC-02:** Given `context: 128_000`, when a catalog label is formatted, then it contains `128k ctx`.
- **AC-03:** Given invalid context metadata, when a catalog label is formatted, then it still contains `context n/a`.

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|--------|--------------------|
| Rounding may hide a non-whole-million value. | Low | Preserve existing rounding semantics and only change the unit at 1,000,000 tokens. |

## 8. References

- Related spec: `specs/2026-08-30-model-search-picker`.
