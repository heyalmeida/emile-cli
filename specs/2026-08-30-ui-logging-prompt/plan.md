# Plan: UI-owned logging and unified prompt language

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-30-ui-logging-prompt` |
| **Status** | `implemented` |

## 1. Technical Approach

Replace `pc` calls in `agent.js`, `compression.js` and `plans.js` with `C` from the UI theme. Replace the API client's local color helpers with `C` from `ui/theme.js`, which has no API dependency. Translate the two Portuguese coding-policy lines in `prompt.js` to English and add a focused regression test that checks the required English policy phrases remain present.

## 2. Architectural Compliance

- **Relevant ADR(s):** ADR-0001; no dependency or build-step change.
- **Architecture:** non-UI modules consume the canonical UI palette only for existing status output; prompt assembly remains in `prompt.js`.
- **Design system:** exact Tokyo Night semantic colors remain unchanged.

## 3. Security and Threat Model

| Element | Handling |
|----------|------------|
| Command execution and whitelist | Not applicable; no execution path changes. |
| File writes and `resolveSafePath` | Not applicable. |
| LLM inputs (prompt injection / tool args) | Static instruction wording only; user/project content is not modified. |
| Secrets (API keys, sessions, exports) | No credentials logged or added to prompt text. |
| Controls and negative tests | Search for imports/raw helpers and assert prompt language plus existing suite. |

## 4. Impacted Modules

| Module | Path | Change |
|--------|---------|---------|
| Agent runtime | `src/agent/agent.js` | Use `C` for warnings/errors/status. |
| Compression | `src/agent/compression.js` | Use `C` for status lines. |
| Plans | `src/plans.js` | Use `C` for progress output. |
| API | `src/api/client.js` | Use canonical `C` palette instead of local ANSI functions. |
| System prompt | `src/prompt.js` | Translate policy lines to English. |
| Tests | `test/ui-logging-prompt.test.js` | Regression checks. |

## 5. Files to Create/Modify

| Action | Path (expected) | Notes |
|------|--------------------|-------------|
| Create | `test/ui-logging-prompt.test.js` | Static import/prompt regression checks. |
| Modify | `src/agent/agent.js`, `src/agent/compression.js`, `src/plans.js`, `src/api/client.js` | Palette migration. |
| Modify | `src/prompt.js` | Language normalization. |
| Modify | `docs/architecture.md`, `IMPROVEMENTS.md`, `CHANGELOG.md` | Documentation sync. |

## 6. Verification Strategy and Gates

- AC-01: targeted `rg` checks for `picocolors`, local ANSI helpers and raw color calls.
- AC-02/04: `npm test` and `node test-ui.js`.
- AC-03: prompt regression test plus targeted search for Portuguese policy phrases.
- Run `node --check` on every touched JS file and `git diff --check`.
- No new dependency; `npm audit` is not applicable.

## 7. Git Workflow

| Item | Answer |
|--------|--------|
| **Feature branch** | `refactor/ui-logging-prompt` |
| **Commit plan** | Implementation/tests first; docs/spec/backlog in a separate explicit commit. Never stage `tmp-fix-thinking.mjs`. |
