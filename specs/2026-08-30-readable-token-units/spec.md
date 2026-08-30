# Spec: Readable token-count units

| Field | Value |
|-------|-------|
| **ID** | `2026-08-30-readable-token-units` |
| **Status** | `approved` |
| **Phase/Context** | Phase 2 — Model picker and input usability |
| **Related documents** | [PRD](../../docs/product.md), [Visual identity](../../docs/visual-identity.md), [Model System](../../features/model-system.md) |

## 1. Problem / Motivation

The input footer and status bar format large token counts with the `k` suffix. A model context of 1,048,576 tokens therefore appears as `1048.6k`, even though a million-token unit is easier to read.

## 2. Goal

Use human-readable `M` units for token counts at or above one million throughout the terminal UI, while retaining the existing `k` representation below one million.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-----------|---------------------|
| RF-S01 | `fmtK(1_000_000)` MUST return `1M`. | Must |
| RF-S02 | Fractional million values MUST retain one decimal when useful, such as `1.5M`. | Must |
| RF-S03 | Values below one million MUST retain the existing `k` formatting. | Must |
| RF-S04 | The formatter MUST NOT alter context calculations, percentages, API payloads or compression thresholds. | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|----------|
| **Risk classification** | Low — presentation-only change to a shared UI number formatter. |
| **Assets/secrets** | Not applicable; only token-count metadata is rendered. |
| **Command execution / file writes** | Not applicable. |
| **Untrusted inputs** | Numeric values are formatted as text; no commands, paths or credentials are involved. |
| **Negative criteria** | Do not change the numeric value used in percentage calculations or model context enforcement. |

## 5. Out of Scope

- Changing model limits, token estimation or model catalog metadata.
- Changing prices, context calculations or API behavior.

## 6. Acceptance Criteria

- **AC-01:** Given a one-million-token value, when rendered in the input footer/status bar, then it appears as `1M`, not `1000k`.
- **AC-02:** Given `1_048_576` tokens, when formatted, then it appears as `1M` using the compact million unit.
- **AC-03:** Given `1_500_000` tokens, when formatted, then it appears as `1.5M`.
- **AC-04:** Given `128_000` tokens, when formatted, then it remains `128k`.
- **AC-05:** Existing context label and malformed-metadata behavior remains unchanged.

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|--------|--------------------|
| Rounding may hide small differences in large counts. | Low | Preserve the formatter's existing one-decimal compact style and change only the unit boundary. |

## 8. References

- Related specs: `specs/2026-08-30-model-search-picker`, `specs/2026-08-30-model-context-display`.
