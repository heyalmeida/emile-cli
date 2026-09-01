# Tasks: Live model list for OpenCode providers

| Field | Value |
|-------|-------|
| **Spec** | `2026-09-01-opencode-model-list` |

---

## Phase 0 — Preparation

- [x] T0.1 — Read relevant documentation (PRD, architecture, visual identity, ADRs) — *Rule 1 of `.clinerules`*
- [x] T0.2 — Confirm this spec and plan are `approved` (small focused spec, approved in-session)
- [x] T0.3 — Classify risk (Medium), map threat surfaces and confirm the plan's gates
- [x] T0.4 — Confirm current branch (`feat/agent-loop`) is the working branch

## Phase 1 — Implementation

- [x] T1.1 — Add `parseProviderModelIds()`, the OpenCode list URLs and `getProviderModelOptions()` to `src/models.js` *(verifies AC-01/AC-02/AC-03)*
- [x] T1.2 — Wire `runModelWizard()` to `getProviderModelOptions()` and correct the OpenCode curated fallback ids in `src/commands.js` *(verifies AC-01/AC-02/AC-03)*
- [x] T1.3 — Correct the OpenCode Zen `baseURL` in `src/api/client.js` *(verifies AC-04)*
- [x] T1.4 — Add parser assertions to `test/models.test.js` *(verifies AC-05)*

## Phase 2 — Testing, Security and Verification

- [x] T2.1 — Positive/negative checks: live `getProviderModelOptions()` returned 63 Zen ids and 33 Go ids; `requesty` returned `[]`; parser tests cover malformed/empty payloads
- [x] T2.2 — `node --check` passed on `src/models.js`, `src/commands.js`, `src/api/client.js`, `src/config.js`, `src/cli.js`, `test/models.test.js`; `npm test` → 147 passed, 0 failed
- [x] T2.3 — `npm audit` not required (no new dependency)
- [x] T2.4 — All acceptance criteria verified (see log below)

## Phase 3 — Documentation and Closing

- [x] T3.1 — Rule 2 sync: `README.md`, `docs/architecture.md`, `CHANGELOG.md`, `docs/product.md`, `features/model-system.md`
- [x] T3.2 — Updated `features/model-system.md` (metadata/lists/picker, known limitations, change history)
- [x] T3.3 — Recorded the `CHANGELOG.md` entry
- [x] T3.4 — No new Mermaid blocks introduced
- [x] T3.5 — Spec status set to `implemented`
- [x] T3.6 — Residual risk recorded: OpenCode Zen non-`chat/completions` model families remain out of scope

---

## Acceptance Criteria Verification Log

| AC | Status | Evidence |
|----|--------|--------------------------------|
| AC-01 | ✅ | `getProviderModelOptions({ provider: 'opencode-go' })` returned 33 ids from `opencode.ai/zen/go/v1/models` (Node probe). |
| AC-02 | ✅ | `getProviderModelOptions({ provider: 'opencode' })` returned 63 ids from `opencode.ai/zen/v1/models` (Node probe). |
| AC-03 | ✅ | `requesty` returns `[]`; `parseProviderModelIds` returns `[]` for null/empty/malformed payloads (unit tests); `getProviderModelOptions` catches fetch errors and returns `[]`. |
| AC-04 | ✅ | `src/api/client.js` sets `baseURL = 'https://opencode.ai/zen/v1'` for `opencode`; `curl https://opencode.ai/zen/v1/chat/completions` returns 401 (endpoint alive). |
| AC-05 | ✅ | `node --check` passed on all touched files; `npm test` → 147/147 passing. |

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| | | |
