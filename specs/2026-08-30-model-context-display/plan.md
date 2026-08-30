# Plan: Human-readable model context labels

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-30-model-context-display` |
| **Status** | `approved` |

## 1. Technical Approach

Update only `formatCatalogModelLabel()` in `src/commands.js`: keep numeric validation and existing rounding, but format values at or above 1,000,000 tokens as rounded whole millions (`M ctx`). Add focused assertions to `test/models.test.js`.

## 2. Architectural Compliance

- **Relevant ADR(s):** ADR-0001; no architectural or dependency change.
- **Architecture:** model label formatting remains in the model wizard boundary.
- **Design system:** existing picker label styling is unchanged.

## 3. Security and Threat Model

| Element | Handling |
|----------|------------|
| Command execution and whitelist | Not applicable. |
| File writes and `resolveSafePath` | Not applicable. |
| LLM inputs (prompt injection / tool args) | Not applicable. |
| Secrets (API keys, sessions, exports) | Not rendered or touched. |
| Controls and negative tests | Preserve existing numeric validation and malformed-metadata test. |

## 4. Impacted Modules

| Module | Path | Change |
|--------|---------|---------|
| Model wizard | `src/commands.js` | Format million-token windows with `M`. |
| Tests | `test/models.test.js` | Add million-window regression coverage. |

## 5. Verification Strategy and Gates

- Run `node --check src/commands.js`, `npm test`, `npm run lint` and `git diff --check`.
- Verify AC-01–AC-03 through unit tests; no new dependency or security surface.

## 6. Git Workflow

| Item | Answer |
|--------|--------|
| **Feature branch** | `feat/model-system` |
| **Documentation branch** | `docs/documentation` |
| **Commit plan** | Code/test commit on `feat/model-system`; spec, CHANGELOG and feature-history sync on `docs/documentation`. |
