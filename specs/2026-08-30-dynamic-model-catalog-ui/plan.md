# Plan: Dynamic model catalog in model selection

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-30-dynamic-model-catalog-ui` |
| **Status** | `implemented` |

## 1. Technical Approach

Extend `src/models.js` to retain normalized catalog entries and expose active-state and provider-filtered listing helpers. Update `src/commands.js` to await catalog initialization for OpenRouter, format context/pricing labels from `getModelInfo()`, and fall back to the existing curated provider lists when the dynamic source is unavailable or not applicable.

## 2. Architectural Compliance

- **Relevant ADR(s):** ADR-0001; no stack or dependency change.
- **Architecture:** model metadata remains owned by `models.js`; wizard presentation remains in `commands.js`.
- **Design system:** wizard labels use the existing canonical `C` palette.

## 3. Security and Threat Model

Remote model ids are data only: normalize and bound labels, never interpolate them into commands or paths. The catalog is unauthenticated and contains no user credential fields consumed by the wizard.

## 4. Impacted Modules

| Module | Path | Change |
|--------|---------|---------|
| Model catalog | `src/models.js` | Expose active catalog and provider-filtered entries. |
| Model wizard | `src/commands.js` | Await catalog, use live OpenRouter entries, display metadata, preserve fallback. |
| Tests | `test/models.test.js` | Validate formatting and safe fallback behavior. |

## 5. Verification Strategy and Gates

- Test dynamic listing/formatting with injected catalog data helpers and static fallback selection.
- Run `node --check` on touched JS files, `npm test`, `git diff --check`, and CLI smoke where credentials are available.
- No new dependency; `npm audit` not applicable.

## 6. Git Workflow

| Item | Answer |
|--------|--------|
| **Feature branch** | `feat/dynamic-model-catalog-ui` |
| **Commit plan** | Implementation/tests, then documentation/backlog sync; never stage `tmp-fix-thinking.mjs`. |
