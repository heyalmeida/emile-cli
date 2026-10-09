# BRIEF P1-3 — Per-model metadata overrides in the global config

> Read first: `specs/2026-10-08-deep-dive-backlog/_shared-constraints.md` and `docs/deep-dive.md` § 8.1–8.3 (option A).

## Goal

OpenCode Zen/Go and other gateways return bare model ids with no metadata, so context window and pricing fall back to static table guesses (`src/models.js:58-77` → `MODEL_INFO` regex → `DEFAULT_MODEL_INFO`, `:46-51`). Add a user-controlled override layer with the highest priority.

## Current behavior (facts)

- Resolution chain in `getModelInfo()` (`models.js:58-77`): dynamic OpenRouter catalog (byExact → bySuffix) → static `MODEL_INFO` regex table → `DEFAULT_MODEL_INFO { context: 262000, inputPrice: 3, outputPrice: 15, reasoning: true }`.
- Config lives in `~/.emile/config.json`, written by `saveUserConfig()` (`src/config.js:127-161`) with `mode: 0600` (`:157`).
- Consumers: `calculateCost`/`getContextLimit` (`src/agent/session-stats.js:29-40`), compression gate (`agent.js:290-305`), model picker labels (`commands.js:220-231`).

## Required design

1. New config key `modelOverrides` in `~/.emile/config.json`:

```json
{ "modelOverrides": { "stealth/space-bunny-alpha": { "context": 200000, "inputPrice": 3, "outputPrice": 15, "reasoning": true } } }
```

2. `config.js`: load `modelOverrides` into a plain object at module load (same pattern as `savedConfig`). Validation: accept an object whose values have `context` (positive integer) and optional `inputPrice`/`outputPrice` (numbers ≥ 0) and `reasoning` (boolean); drop invalid entries with a `warn()` (`src/ui/log.js`), never throw. **No zod dependency required** — plain validation is fine (avoid adding deps without ADR).
3. `getModelInfo(model)`: consult overrides FIRST (exact id match, then last path segment like the catalog does), then the existing chain. Partial override wins per-field: an entry with only `context` leaves prices to the normal chain.
4. `saveUserConfig()` (`config.js:127-161`): persist `modelOverrides` round-trip (preserve unknown models).
5. Wizard hook: in `runModelWizard` (`src/commands.js:164-217`), after picking a model, if `getModelInfo` used a static/default fallback, offer: "Set context window / pricing for this model?" → three `text` prompts (context tokens; prices USD/1M, blank to skip; reasoning y/n) → write into `modelOverrides`. Keep the wizard bounded (one optional step, cancellable).

## Tests to add (`test/model-overrides.test.js`)

- Override by exact id wins over dynamic catalog and static table.
- Override by last segment (`"glm-4.7"` matches `z-ai/glm-4.7`).
- Invalid entries dropped with warning, valid ones survive.
- `saveUserConfig` round-trips the map.
- With NO overrides configured, `getModelInfo` output identical to today (regression).

## Constraints

- Do not change `MODEL_INFO`, catalog fetch, or `sessionStats` internals.
- Overrides live in the user-global file only (no workspace-level override in this brief).

## Verification

`node --check src/models.js src/config.js && node --test test/model-overrides.test.js && npm run lint && npm test`

## Docs sync (Rule 2)

- CHANGELOG `[Unreleased]` → Added: `modelOverrides` per-model context/pricing overrides.
- `README.md` config section: document the key with one example.
- `docs/deep-dive.md` § 8.3-A: mark applied.
