# Plan: Contributor lint and CI gates

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-30-open-source-readiness` |
| **Status** | `approved` |

## 1. Technical Approach

Add ESLint 8 as a dev dependency, a minimal `.eslintrc.json` for ES modules/Node, the `lint` package script, and a Node 20 GitHub Actions workflow using `npm ci`, `npm run lint` and `npm test`. Keep test script unchanged.

## 2. Verification

Run `npm run lint`, `npm test`, `npm audit --omit=dev` and `git diff --check`. Record dependency audit output and any lint warnings.

## 3. Git Workflow

| Item | Answer |
|------|--------|
| **Feature branch** | `chore/open-source-readiness` |
| **Commit plan** | Tooling/spec first, then docs/backlog/changelog and registry sync. |
