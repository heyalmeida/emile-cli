# Spec: Live model list for OpenCode providers

| Field | Value |
|-------|-------|
| **ID** | `2026-09-01-opencode-model-list` |
| **Status** | `implemented` |
| **Phase/Context** | Model selection — provider model discovery |
| **Related documents** | [PRD](../../docs/product.md), [Architecture](../../docs/architecture.md), [Code quality](../../docs/code-quality-and-security.md), [ADR-0001](../../docs/adr/0001-tech-stack-choice.md) |

---

## 1. Problem / Motivation

`/model` shows a hand-maintained list for the `opencode` and `opencode-go` providers. That list contains stale or wrong identifiers — e.g. `anthropic/claude-sonnet-4-5`, `google/gemini-2.5-pro` and `openai/gpt-4.1` for OpenCode Zen, which now uses bare ids and a different endpoint — so users are offered models that are not actually available. OpenRouter already solves this by fetching its live catalog; the OpenCode gateways have the same need but are not wired to their own list endpoints.

Additionally, the OpenCode Zen base URL in `src/api/client.js` (`https://api.opencode.ai/v1`) no longer resolves; the current gateway is `https://opencode.ai/zen/v1`. Without correcting it, even a valid model id selected from a live list would fail on the next request.

## 2. Goal

`/model` fetches the live model list for `opencode` (OpenCode Zen) and `opencode-go` (OpenCode Go) — falling back to curated options on failure — and the OpenCode Zen client points at the correct gateway base URL.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-----------|---------------------|
| RF-S01 | `models.js` fetches the OpenAI-compatible `GET /models` list for `opencode` (`https://opencode.ai/zen/v1/models`) and `opencode-go` (`https://opencode.ai/zen/go/v1/models`). | Must |
| RF-S02 | `/model` uses the fetched ids for OpenCode providers and shows the existing context/pricing label from `getModelInfo()`. | Must |
| RF-S03 | A network/parse failure leaves the curated fallback and manual-entry path available, never throws through the wizard. | Must |
| RF-S04 | The OpenCode Zen API client uses `https://opencode.ai/zen/v1`. | Must |
| RF-S05 | Remote ids are sanitized and treated as untrusted display data (no control characters, no secret leakage). | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|----------|
| **Risk classification** | Medium — changes provider/model selection and the OpenCode Zen base URL, but does not execute commands or write workspace files beyond the existing config save. |
| **Assets/secrets** | API key remains in config and is never included in model-list options or labels. |
| **Command execution / file writes** | Not applicable to the list fetch; `saveUserConfig()` behavior is unchanged. |
| **Untrusted inputs** | Remote model ids are normalized to strings, filtered and rendered through the existing `formatCatalogModelLabel()`/picker sanitizers; ids are never used as paths or commands. |
| **Negative criteria** | Invalid/empty payloads must not replace a usable curated list; a failed fetch must not throw; no secret is rendered. |

## 5. Out of Scope

- Multi-endpoint routing for OpenCode Zen's non-`chat/completions` model families (Responses API, Anthropic Messages API, Google-native). emile remains an OpenAI-SDK `chat/completions` client; this spec only fixes the base URL and the `/model` list.
- Requesty live catalog (still curated).
- Changing the OpenRouter catalog/cache format.

## 6. Acceptance Criteria

- **AC-01:** Given network access and provider `opencode-go`, when `/model` builds options, then the ids come from `https://opencode.ai/zen/go/v1/models`.
- **AC-02:** Given network access and provider `opencode`, when `/model` builds options, then the ids come from `https://opencode.ai/zen/v1/models`.
- **AC-03:** Given a failed or empty model-list fetch, when `/model` opens, then the curated fallback and `custom` remain available and the wizard does not throw.
- **AC-04:** Given provider `opencode`, when the client initializes, then `baseURL` is `https://opencode.ai/zen/v1`.
- **AC-05:** `node --check` passes on touched files and the existing test suite remains green.

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|--------|--------------------|
| OpenCode Zen routes model families to different endpoints (`/responses`, `/messages`, native). | Models outside the OpenAI-compatible path may still fail at call time. | Documented out of scope; the `/model` list and base URL are corrected, and the limitation is recorded in the feature registry. |
| The `/models` payload carries only ids, not context/pricing. | Labels fall back to static/default metadata. | Use `getModelInfo()` (static table + default) for display, as with curated options today. |

## 8. References

- `IMPROVEMENTS.md` §4.1 (OpenRouter catalog) — pattern this mirrors for OpenCode.
- `specs/2026-08-25-dynamic-model-catalog`, `specs/2026-08-30-dynamic-model-catalog-ui`, `specs/2026-08-30-model-search-picker`.
- OpenCode Zen documentation: `https://opencode.ai/docs/zen/` (endpoints and `/v1/models`).
