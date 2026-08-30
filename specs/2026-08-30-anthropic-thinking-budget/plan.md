# Plan: Native Anthropic thinking budgets

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-30-anthropic-thinking-budget` |
| **Status** | `implemented` |

## 1. Technical Approach

Add a normalized Anthropic-family detector and fixed effort-to-budget map in `src/api/client.js`. Apply it before the existing OpenRouter and generic OpenAI-compatible branches. Requesty Anthropic model ids are treated as native-compatible per the backlog proposal; all other providers retain current behavior.

## 2. Verification

Extend `test/api-client.test.js` with positive, disabled and regression cases. Run syntax checks, `npm test` and `git diff --check`; no dependency change.

## 3. Git Workflow

| Item | Answer |
|------|--------|
| **Feature branch** | `feat/anthropic-thinking-budget` |
| **Commit plan** | Implementation/tests, then model-system docs/backlog/changelog. |
