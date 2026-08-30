# Spec & Plan: Dynamic model catalog via OpenRouter (Pass 2 of model system)

| Field | Value |
|-------|-------|
| **ID** | `2026-08-25-dynamic-model-catalog` |
| **Status** | `approved` → `implemented` |
| **Branch** | `feat/model-system` |

---

## 1. Problem / Motivation

The static `MODEL_INFO` table mislabels reasoning for several families (GLM 5.x, stealth/codename models, etc. — OpenRouter currently lists 285 of 417 models with the `reasoning`/`include_reasoning` parameter) and goes stale as vendors ship. Model metadata is public and queryable by id from **OpenRouter's unauthenticated catalog endpoint** (`GET https://openrouter.ai/api/v1/models`), which returns per model: `context_length`, `pricing.prompt/completion` (USD per token) and `supported_parameters`.

## 2. Goal

Resolve model metadata dynamically by id from the OpenRouter catalog (fresh at every startup), keeping the static table as offline/fallback — so effort gating, cost estimates and context limits are correct for any model the provider routes, without hardcoding.

## 3. Functional Requirements

| ID | Requirement | Priority |
|----|-----------|----------|
| RF-S01 | `initModelCatalog()`: fetches the public catalog once at startup (non-blocking, 10s timeout); builds an in-memory index; persists to `.emile/models-cache.json` with `fetchedAt` | Must |
| RF-S02 | Resolution order in `getModelInfo()`: dynamic exact-id match → dynamic last-segment match (handles providers with different prefix conventions) → static `MODEL_INFO` → default | Must |
| RF-S03 | Mapping: `context_length` → context; `pricing.prompt/completion` × 1M → prices; `reasoning` = `supported_parameters` contains `reasoning`, `include_reasoning` or `reasoning_effort`; free models (`pricing === "0"`) → zero cost | Must |
| RF-S04 | Offline resilience: if the fetch fails, load `.emile/models-cache.json` (accepted up to 30 days old); if nothing, fall back to the static table silently | Must |
| RF-S05 | Catalog refresh: persisted cache older than 24h triggers a background refetch on startup; failures never block or crash the CLI | Should |

## 4. Risk / Security

- Public endpoint, no auth, no user data sent — no new secret surface.
- Fetch is fire-and-forget with timeout; a down endpoint degrades to cache/static (fail-open).
- Cache file lives in gitignored `.emile/`; contains only public catalog data.

## 5. Acceptance Criteria

- **AC-01:** With network, `initModelCatalog()` resolves ≥ 300 models; `getModelInfo('z-ai/glm-4.6').reasoning === true` and context matches the live catalog.
- **AC-02:** A stealth/codename model present in the catalog resolves by id (no static entry needed).
- **AC-03:** Without network, resolution falls back to the persisted cache, then to the static table — never throws.
- **AC-04:** Free models resolve to zero pricing.
- **AC-05:** `node --check` on touched files; existing unit tests still pass.

## Verification Log

| AC | Status | Evidence |
|----|--------|----------|
| AC-01 | ✅ | Live probe: 417 models; GLM 4.6 → ctx 204800, reasoning true (unit script) |
| AC-02 | ✅ | Suffix + exact matching over the full live catalog (unit script) |
| AC-03 | ✅ | Unit script forces offline path → persisted cache → static fallback |
| AC-04 | ✅ | Pricing "0" maps to 0/0 (unit script) |
| AC-05 | ✅ | `node --check` + existing tests pass |
