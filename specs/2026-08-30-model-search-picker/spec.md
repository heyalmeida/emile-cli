# Spec: Incremental model search picker

| Field | Value |
|-------|-------|
| **ID** | `2026-08-30-model-search-picker` |
| **Status** | `implemented` |
| **Phase/Context** | Phase 2 — UI and provider model discovery |
| **Related documents** | [PRD](../../docs/product.md), [Architecture](../../docs/architecture.md), [Visual identity](../../docs/visual-identity.md), [ADR-0001](../../docs/adr/0001-tech-stack-choice.md) |

## 1. Problem / Motivation

`/model` currently passes the complete provider list to a static select prompt. The OpenRouter catalog can contain hundreds of models, making the prompt difficult to scan and slow to use. RF-08 requires model selection, but the interaction needs incremental discovery instead of rendering every option at once.

## 2. Goal

Provide a searchable `/model` picker that renders at most seven matching models at a time and updates the matches as the user types. OpenRouter searches its best-effort live/cache catalog; providers without a validated catalog endpoint search their existing curated options.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-----------|---------------------|
| RF-S01 | `/model` MUST show an incremental search field and no more than seven model results at once. | Must |
| RF-S02 | Typing MUST filter model identifiers and labels case-insensitively by substring and refresh the visible results immediately. | Must |
| RF-S03 | The picker MUST support arrow-key selection, Enter to choose, Esc/Ctrl+C cancellation, and preserve the existing manual custom-model path. | Must |
| RF-S04 | OpenRouter MUST use the initialized dynamic catalog when available; other providers MUST retain their curated model lists without pretending to have an unsupported remote catalog. | Must |
| RF-S05 | The picker MUST handle an empty query, no matches, malformed labels, narrow terminals, and non-TTY input without exposing control sequences or hanging. | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|----------|
| **Risk classification** | Medium — interactive terminal state and remote model metadata are changed, but the picker does not execute commands or write user files directly. |
| **Assets/secrets** | API keys and config remain outside picker rendering; model ids are displayed as untrusted metadata only. |
| **Command execution / file writes** | Not applicable to the picker. Existing `saveUserConfig()` behavior remains unchanged and the catalog cache continues through `models.js`. |
| **Untrusted inputs** | Provider catalog ids/labels and user query are sanitized for display; control characters are removed and model ids are never used as paths or commands. |
| **Negative criteria** | Never render more than seven model rows, never interpolate raw control characters, never block when stdin is not a TTY, and never treat a no-match query as a valid model selection. |

## 5. Out of Scope

- Adding undocumented catalog endpoints for Requesty, OpenCode Zen, or OpenCode Go.
- Replacing the provider connection wizard or changing model validation semantics.
- Ranking, pagination, or downloading provider-specific catalogs beyond the existing OpenRouter source.

## 6. Acceptance Criteria

- **AC-01:** Given a provider with more than seven available models, when `/model` opens with an empty query, then at most seven model rows are rendered.
- **AC-02:** Given a query typed into the picker, when its characters change, then the visible rows contain only models whose id or label includes the query case-insensitively, capped at seven.
- **AC-03:** Given a matching result, when the user navigates and presses Enter, then that model is saved as the active model; Esc/Ctrl+C leaves configuration unchanged.
- **AC-04:** Given OpenRouter catalog initialization succeeds, when `/model` opens, then live/cache catalog entries are searchable; when it is unavailable, the curated fallback remains usable.
- **AC-05:** Given a non-TTY input or malformed catalog metadata, when the picker is invoked, then it does not hang or emit terminal control characters and returns a safe fallback/cancel result.

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|--------|--------------------|
| Some providers do not expose a known public model-list endpoint. | Their lists may become stale. | Search curated provider options and document the limitation; add endpoints only with provider-specific evidence later. |
| Raw-mode redraw can leave terminal state altered after interruption. | Poor shell UX. | Restore raw mode/listeners on Enter, Esc, Ctrl+C, and errors; cover narrow-width/manual checks. |

## 8. References

- Product/architecture documents consulted: `README.md`, `docs/product.md`, `docs/architecture.md`, `docs/visual-identity.md`, `docs/code-quality-and-security.md`, `docs/glossary.md`, ADR-0001 and ADR-0002.
- Related specs: `specs/2026-08-30-dynamic-model-catalog-ui`, `specs/2026-08-25-dynamic-model-catalog`.
