# Plan: Relevance-gated workspace skills

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-30-skill-relevance` |
| **Status** | `implemented` |

## 1. Technical Approach

Add `filterSkillsByRelevance(requestedNames, prompt)` in `src/skills.js`. Auto mode (`all`) loads workspace-detected skills and keeps those with meaningful keyword overlap from name/description plus `clean-code`; explicit lists pass through unchanged. `runAgentInner` filters before building the cache key/system prompt so each prompt gets the appropriate skill set without mutating the caller's list.

## 2. Verification

Add pure metadata tests, run all syntax checks, `npm test` and `git diff --check`. No new dependency.

## 3. Git Workflow

| Item | Answer |
|------|--------|
| **Feature branch** | `feat/skill-relevance` |
| **Commit plan** | Implementation/tests, then docs/backlog/feature registry. |
