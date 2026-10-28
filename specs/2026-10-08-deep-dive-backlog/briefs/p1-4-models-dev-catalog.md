# BRIEF P1-4 — models.dev catalog as per-provider metadata source

> Read first: `specs/2026-10-08-deep-dive-backlog/_shared-constraints.md` and `docs/deep-dive.md` § 8.1–8.3 (option B). Pairs with P1-3 (overrides keep priority over this).

## Goal

The OpenRouter live catalog only covers OpenRouter ids. Gateways like OpenCode Zen/Go and Requesty publish ids without metadata (`src/models.js:247-260`, `parseProviderModelIds` extracts ids only, `:265-269`). Add `https://models.dev/api.json` as a second dynamic source, provider-scoped, with the same fire-and-forget + cache pattern the OpenRouter catalog already uses.

## Existing pattern to copy (do not reinvent)

- `CATALOG_URL` / TTLs / cache file: `models.js:96-98`, persisted at `<workspace>/.emile/models-cache.json` (`catalogCachePath`, `:102-104`), seeded offline via `loadPersistedCatalog` (`:140-152`), refetched by `initModelCatalog` (`:183-214`).
- Mapping to emile's shape: `mapCatalogEntry` (`:107-121`).

## Required design

1. New constants: `DEV_CATALOG_URL = 'https://models.dev/api.json'`, same 24h refetch / 30-day cache validity.
2. `fetchDevCatalog()` alongside `fetchCatalog()` (`models.js:162-172`): fetch with 10s timeout (`AbortSignal.timeout`), parse into an index `{ byProvider: Map<providerName, Map<modelId, info>> }`. The models.dev payload shape is `{ <provider>: { models: { <modelId>: { limit: { context: n }, cost: { input: <usd/1M>, output: USD/1M }, ... } } } }` — map `limit.context → context`, `cost.input/output → inputPrice/outputPrice`, and derive `reasoning` from the entry's `modalities`/`reasoning` hints ONLY if present, else omit the field (let the static chain decide).
3. Provider matching: accept provider names `opencode`, `opencode-go`, `requesty` as aliases into the models.dev provider ids (store the mapping in one const at the top; if models.dev uses a different key for these providers, handle the alias centrally in one function, never with scattered conditionals).
4. `getModelInfo` chain becomes: user overrides (P1-3, if landed) → **provider-scoped models.dev entry when `config.provider` has a models.dev source** → OpenRouter catalog → static table → default. Do not let an unknown provider crash resolution.
5. Cache: `.emile/models-dev-cache.json`, TTL 24h, max age 30d, same shape as the OpenRouter cache (`models.js:102-160` — copy the pattern).
6. Network failures NEVER block startup (fire-and-forget from `initModelCatalog`'s call site, `src/cli.js:97-98`) and never log at warning level more than once per session.

## Tests to add (`test/models-dev-catalog.test.js`)

- Unit-test `mapDevEntry`/indexing with a fixture payload shaped like models.dev (no network in tests; mock `fetch`).
- Provider aliasing: `opencode` and `opencode-go` resolve through their alias.
- Override > dev catalog > OpenRouter catalog ordering (P1-3 interplay).
- Offline behavior: with cache absent and fetch failing, `getModelInfo` falls back exactly as today.

## Constraints

- `getDynamicModels()` stays OpenRouter-only (do not leak dev-catalog models into the OpenRouter picker list).
- No new dependencies (global `fetch` is available on Node ≥ 18).

## Verification

`node --check src/models.js && node --test test/models-dev-catalog.test.js && npm run lint && npm test`

## Docs sync (Rule 2)

- CHANGELOG `[Unreleased]` → Added: models.dev catalog for OpenCode/Requesty metadata.
- `docs/deep-dive.md` § 8.1/8.3-B: mark applied.
