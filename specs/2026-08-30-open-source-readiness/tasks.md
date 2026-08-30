# Tasks: Contributor lint and CI gates

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-30-open-source-readiness` |

## Phase 0 — Preparation

- [x] T0.1 — Read package, contributor, security, architecture and CI context.
- [x] T0.2 — Create and approve spec/plan.
- [x] T0.3 — Classify medium risk and review dependency origin/audit requirement.
- [x] T0.4 — Create feature branch.

## Phase 1 — Implementation

- [x] T1.1 — Add ESLint config/script and lockfile dependency *(AC-01)*.
- [x] T1.2 — Add Node 20 GitHub Actions workflow *(AC-03)*.
- [x] T1.3 — Preserve and verify test script *(AC-02, AC-03)*.

## Phase 2 — Verification

- [x] T2.1 — Run lint, tests, audit and diff checks. Lint passed with 188 existing warnings and no errors; 96 tests passed; `git diff --check` passed; `npm audit --omit=dev` initially found five transitives and `npm audit fix` updated them, after which the full audit reported zero vulnerabilities.
- [x] T2.2 — Verify acceptance criteria.

## Phase 3 — Documentation

- [x] T3.1 — Sync README, contributing, security, product, backlog and changelog.
- [x] T3.2 — Mark spec implemented and commit explicit paths.

## Acceptance Criteria Verification Log

| AC | Status | Evidence |
|----|--------|----------|
| AC-01 | ✅ | `npm run lint` exits 0; `.eslintrc.json` and the ESLint lockfile entry are present. |
| AC-02 | ✅ | `npm test` exits 0 with 20 files and 96 tests passing. |
| AC-03 | ✅ | `.github/workflows/ci.yml` runs `npm ci`, `npm run lint`, and `npm test` on Node 20; `git diff --check` passes. |

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| `1a2ab4a` | `chore(quality): add lint and CI gates` | Tooling, workflow, docs and SDD |
| `7d7212b` | `docs(backlog): close improvement roadmap` | Post-audit dependency refresh and final status synchronization |
