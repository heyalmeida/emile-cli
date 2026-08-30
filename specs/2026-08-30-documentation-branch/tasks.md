# Tasks: Dedicated documentation branch

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-30-documentation-branch` |

## Phase 0 — Preparation

- [x] T0.1 — Read the repository workflow, feature catalog and SDD instructions.
- [x] T0.2 — Confirm this spec and plan are `approved`.
- [x] T0.3 — Classify the change as low risk and define the no-source-file control.
- [x] T0.4 — Create/switch to `docs/documentation` from `development`.

## Phase 1 — Implementation

- [x] T1.1 — Update `.clinerules` with the documentation branch policy.
- [x] T1.2 — Synchronize contributor, README, SDD, glossary, changelog and feature-index documentation.
- [x] T1.3 — Verify every feature maps to an existing canonical code branch; all 13 catalog entries are covered.
- [x] T1.4 — Commit only documentation files on `docs/documentation`; commit `31eec14` contains no `src/`, `test/` or `bin/` path.
- [x] T1.5 — Publish and track `origin/docs/documentation`.

## Phase 2 — Testing, Security and Verification

- [x] T2.1 — Verify no source or test file is staged; the staged-path audit passed.
- [x] T2.2 — Verify branch ancestry, feature coverage and remote tracking; all 13 feature mappings resolve to existing branches and the docs branch tracks its origin.
- [x] T2.3 — Run `git diff --check` and verify clean status after the documentation commit.
- [x] T2.4 — Verify all acceptance criteria one by one; results are recorded below.

## Phase 3 — Documentation and Closing

- [x] T3.1 — Record the workflow change in `CHANGELOG.md`.
- [x] T3.2 — Feature registry: update the existing index only; this is workflow maintenance, not a product feature.
- [x] T3.3 — No Mermaid blocks changed.
- [x] T3.4 — Update this spec and plan status to `implemented`.
- [x] T3.5 — Record limitations and residual risk: documentation commits are intentionally separate and must be merged into `development` independently of code branches.

## Acceptance Criteria Verification Log

| AC | Status | Evidence (how it was verified) |
|----|--------|--------------------------------|
| AC-01 | ✅ | `docs/documentation` was created from `development` at `090aed7`. |
| AC-02 | ✅ | `.clinerules` and contributor documentation route documentation commits to `docs/documentation`. |
| AC-03 | ✅ | `features/README.md` maps all 13 catalog features to canonical code branches. |
| AC-04 | ✅ | README, CONTRIBUTING, SDD README/templates, glossary, roadmap and `.clinerules` are consistent. |
| AC-05 | ✅ | `origin/docs/documentation` exists and tracks local `docs/documentation` at `31eec14`. |

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| `31eec14` | `docs(workflow): centralize documentation commits` | Workflow docs, feature mapping and SDD record |
