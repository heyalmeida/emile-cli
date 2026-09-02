# Plan: Readable token-count units

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-30-readable-token-units` |
| **Status** | `implemented` |

## 1. Technical Approach

Extend the existing `fmtK()` helper in `src/ui/theme.js` with a million-token branch before the current thousand-token branch. Keep all callers unchanged so the input footer and status bar receive the new display automatically. Add focused unit assertions to `test/models.test.js`.

## 2. Architectural Compliance

- **Relevant ADR(s):** ADR-0001; no architectural or dependency change.
- **Architecture:** shared terminal number formatting remains owned by `src/ui/theme.js`.
- **Design system:** existing muted footer/status presentation is unchanged; only the unit text changes.

## 3. Security and Threat Model

| Element | Handling |
|----------|------------|
| Command execution and whitelist | Not applicable. |
| File writes and `resolveSafePath` | Not applicable. |
| LLM inputs (prompt injection / tool args) | Not applicable. |
| Secrets (API keys, sessions, exports) | Not rendered or touched. |
| Controls and negative tests | Test unit boundaries and confirm no context calculation caller changes. |

## 4. Impacted Modules

| Module | Path | Change |
|--------|---------|---------|
| UI number formatting | `src/ui/theme.js` | Format values >= 1M with `M`. |
| Tests | `test/models.test.js` | Cover million, fractional-million and existing thousand output. |

## 5. Verification Strategy and Gates

- Run `node --check src/ui/theme.js`, `npm test`, `npm run lint` and `git diff --check`.
- Verify the input/footer consumers remain wired to `fmtK()` and the formatter tests cover AC-01–AC-05.

## 6. Git Workflow

| Item | Answer |
|--------|--------|
| **Feature branch** | `feat/model-system` |
| **Documentation branch** | `docs/documentation` |
| **Commit plan** | Code/test commit on `feat/model-system`; spec, CHANGELOG and feature-history sync on `docs/documentation`. |
