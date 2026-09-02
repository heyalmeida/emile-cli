# Plan: Live model list for OpenCode providers

| Field | Value |
|-------|-------|
| **Spec** | `2026-09-01-opencode-model-list` |
| **Status** | `draft` |

---

## 1. Technical Approach

Add a provider-model-list path to `src/models.js` that mirrors the existing OpenRouter catalog flow but for OpenCode's OpenAI-compatible `GET /models` endpoints. The payload carries only ids, so display metadata resolves through the existing `getModelInfo()` (static table + default).

- `src/models.js`: add a `PROVIDER_MODEL_LIST_URLS` map, a pure `parseProviderModelIds(data)` helper, a small in-memory cache, and an exported `getProviderModelOptions({ provider })` that unifies OpenRouter + OpenCode list sources.
- `src/commands.js`: `runModelWizard()` calls `getProviderModelOptions()` instead of only special-casing OpenRouter; update the OpenCode curated fallback lists to valid bare ids.
- `src/api/client.js`: correct the `opencode` base URL to `https://opencode.ai/zen/v1`.

## 2. Architectural Compliance

- **ADR(s):** ADR-0001 (OpenAI SDK client) — unchanged; OpenCode remains an OpenAI-compatible gateway, so no new ADR is required.
- **Architecture document:** `models.js` stays the single model-metadata/list source; the change extends its responsibility and `docs/architecture.md` will be updated. Terminal interaction remains in `ui/model-picker.js`.
- **Design system:** no visual changes; labels reuse `formatCatalogModelLabel()` and existing picker sanitization.

## 3. Security and Threat Model

| Element | Handling |
|----------|------------|
| Command execution and whitelist | Not applicable — no command execution added. |
| File writes and `resolveSafePath` | Not applicable — only the existing `saveUserConfig()` writes config. |
| LLM inputs (prompt injection / tool args) | Remote ids are treated as untrusted data: normalized to strings, trimmed, filtered through `parseProviderModelIds()` and rendered via existing sanitizers. |
| Secrets (API keys, sessions, exports) | Model-list fetch is unauthenticated; API keys are never sent or rendered. |
| Controls and negative tests | Empty/malformed payloads return `[]`; fetch failure is caught and degrades to curated options; a 10s timeout prevents hangs. |

## 4. Impacted Modules

| Module | Path | Change |
|--------|---------|---------|
| Model metadata/list | `src/models.js` | Add OpenCode list fetch + `getProviderModelOptions()`. |
| Model wizard | `src/commands.js` | Use `getProviderModelOptions()`; correct curated fallback ids. |
| API client | `src/api/client.js` | Fix OpenCode Zen base URL. |

## 5. Impacted Flags / Slash Commands / Tools

| Type | Name | Change |
|------|------|--------|
| Slash command | `/model` | Now fetches OpenCode Zen/Go live model lists. |

## 6. Files to Create/Modify

| Action | Path | Notes |
|------|--------------------|-------------|
| Create | `specs/2026-09-01-opencode-model-list/spec.md` | This spec. |
| Create | `specs/2026-09-01-opencode-model-list/plan.md` | This plan. |
| Create | `specs/2026-09-01-opencode-model-list/tasks.md` | Task ledger. |
| Modify | `src/models.js` | List fetch + parser + unified options. |
| Modify | `src/commands.js` | Wizard wiring + curated ids. |
| Modify | `src/api/client.js` | OpenCode Zen base URL. |
| Modify | `test/models.test.js` | Cover `parseProviderModelIds()`. |
| Modify | `CHANGELOG.md`, `README.md`, `docs/architecture.md`, `features/model-system.md` | Rule 2 sync. |

## 7. Technical Decisions (summary)

- Keep OpenRouter's rich metadata catalog separate from OpenCode's id-only list; do not force OpenCode ids through OpenRouter's catalog cache format.
- `getProviderModelOptions()` is the single async entry point used by `/model`, returning `[{ id, info }]` for any provider with a live list and `[]` otherwise.

## 8. Verification Strategy and Gates

- `node --check src/models.js src/commands.js src/api/client.js`
- `npm test` (existing suite) + new parser assertions in `test/models.test.js`.
- Manual live probes already recorded: `curl https://opencode.ai/zen/v1/models` (63 ids) and `curl https://opencode.ai/zen/go/v1/models` (33 ids); `https://opencode.ai/zen/v1/chat/completions` returns 401 without a key (endpoint alive).
- Smoke test: `node bin/emile.js --verbose` reaches the prompt.

## 9. Git Workflow

| Item | Answer |
|------|--------|
| **Feature branch** | Current `feat/agent-loop` (no new branch created for this focused change) |
| **Documentation branch** | `docs/documentation` for README/docs/specs/features/CHANGELOG |
| **Commit plan** | Code + tests on the product branch; documentation on `docs/documentation`; stage only explicit paths |

## 10. Failures, Partial State and Rollback

| Topic | Strategy |
|------|------------|
| Error handling and user-facing messages | Fetch errors are swallowed and degrade to curated options; no partial list is shown. |
| Interruption (Ctrl+C / Esc) and readline state | Unchanged picker behavior; list fetch happens before the picker opens. |
| Partial state (session, undo stack, file cache) | No new state beyond the in-memory list cache. |
| Rollback / undo | No file writes beyond `saveUserConfig()` on selection. |

## 11. Technical Risks and Trade-offs

| Risk | Likelihood | Mitigation |
|-------|---------------|-----------|
| OpenCode Zen non-`chat/completions` families still fail at call time | High for those families | Documented out of scope; fix base URL + list, note limitation. |
| `/models` payload lacks context/pricing | Certain | `getModelInfo()` static/default fallback labels. |
