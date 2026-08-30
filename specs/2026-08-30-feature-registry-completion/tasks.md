# Tasks: Complete the retroactive feature registry

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-30-feature-registry-completion` |

## Phase 0 — Preparation

- [x] T0.1 — Inspect the existing feature catalog and implemented specs.
- [x] T0.2 — Create and approve the documentation spec and plan.
- [x] T0.3 — Create the documentation feature branch.

## Phase 1 — Documentation

- [x] T1.1 — Add four template-based feature files *(AC-01, AC-02)*.
- [x] T1.2 — Update feature index and roadmap *(AC-02, AC-03)*.
- [x] T1.3 — Update backlog and changelog *(AC-03, AC-04)*.

## Phase 2 — Verification

- [x] T2.1 — Verify source-spec links, Markdown tables and diff whitespace.
- [x] T2.2 — Run `npm run lint` and `npm test` to detect accidental changes.
- [x] T2.3 — Mark the spec implemented and commit explicit paths.

## Acceptance Criteria Verification Log

| AC | Status | Evidence |
|----|--------|----------|
| AC-01 | ✅ | `features/agent-loop.md`, `built-in-tools.md`, `plans-mode.md` and `context-compression.md` use the registry template. |
| AC-02 | ✅ | Feature index rows and source-spec links point to existing paths. |
| AC-03 | ✅ | Phase 0, Phase 2, Phase 3 and `IMPROVEMENTS.md` now report the delivered registry and quality work. |
| AC-04 | ✅ | `npm run lint`, `npm test` and `git diff --check` pass; documentation changes add a changelog entry. |

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| `8498002` | `docs(registry): complete retroactive feature catalog` | Feature docs, index, roadmap, backlog, ADR and SDD |
| `7d7212b` | `docs(backlog): close improvement roadmap` | Final status synchronization and audit remediation |
