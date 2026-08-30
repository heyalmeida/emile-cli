# Plan: Friendly API failures and network-pipe warnings

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-30-error-ux` |
| **Status** | `implemented` |

## 1. Technical Approach

Add pure `formatApiError` classification and status-aware retry text in `src/api/client.js`; keep throwing the original error so `agent.js` can still detect context overflow and model fallback. Add `isNetworkPipeCommand` plus a specialized confirmation message in the existing command handler. Export both pure helpers for regression tests.

## 2. Security and Verification

The warning is advisory UI only. Safe mode, dry-run and whitelist behavior remain unchanged. Tests verify warning classification, retry delay, original-error preservation by behavior, and non-network false positives.

## 3. Files

| Action | Path |
|--------|------|
| Modify | `src/api/client.js`, `src/agent/agent.js`, `src/tools/handlers/run-command.js` |
| Create | `test/error-ux.test.js` |
| Sync | README, product, architecture, security, feature registry, backlog and changelog |

## 4. Git Workflow

| Item | Answer |
|------|--------|
| **Feature branch** | `feat/error-ux` |
| **Commit plan** | Implementation/tests, then documentation/backlog sync. |
