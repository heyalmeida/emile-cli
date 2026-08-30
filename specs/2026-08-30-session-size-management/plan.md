# Plan: Bounded session snapshots and cleanup

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-30-session-size-management` |
| **Status** | `implemented` |

## 1. Technical Approach

Add `maxSessionSize` to config with a 10MB default and environment/CLI override. In `history.js`, project messages for persistence, replace oldest tool contents while serialized record bytes exceed the limit, and emit a UI warning when trimming occurs. Add `cleanSessions(olderThanDays)` and route `/sessions clean N` through the existing command registry.

## 2. Security and Verification

Only generated history paths are deleted; no user-supplied path is accepted. Tests use temporary history directories via the pure trimming helper and validate no live mutation.

## 3. Git Workflow

| Item | Answer |
|------|--------|
| **Feature branch** | `feat/session-size-management` |
| **Commit plan** | Implementation/tests, then docs/feature/backlog/changelog. |
