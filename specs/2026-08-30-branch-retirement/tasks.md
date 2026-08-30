# Tasks: Retire orphaned branch refs after topology migration

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-30-branch-retirement` |

## Phase 0 — Preparation

- [x] T0.1 — Read the branch workflow, topology spec and relevant repository policy.
- [x] T0.2 — Confirm this spec and plan are `approved`.
- [x] T0.3 — Classify cleanup as medium risk and confirm explicit target allowlists.
- [x] T0.4 — Create/switch to `chore/branch-retirement`.

## Phase 1 — Implementation

- [x] T1.1 — Re-fetch origin and capture the current branch inventory. The remote contained 22 legacy archives, 13 canonical branches, `development`, `main` and the prior migration branch.
- [x] T1.2 — Compare canonical branches with `development`; no exclusive commits existed, so no product-branch merge commit was needed. The cleanup branch carries only this documentation closeout and will be fast-forwarded into `development`.
- [ ] T1.3 — Delete the explicit orphan refs remotely and locally after all guards pass.
- [x] T1.4 — Add the changelog closeout entry.

## Phase 2 — Testing, Security and Verification

- [x] T2.1 — Verify zero unique commits on all canonical branches and document whether a merge was needed. All 13 report `development..branch = 0`; no merge was needed.
- [ ] T2.2 — Verify protected refs and canonical refs remain.
- [ ] T2.3 — Verify orphan refs are absent, `main` is unchanged, `git fsck` is clean and the worktree is clean.
- [ ] T2.4 — Verify all acceptance criteria one by one.

## Phase 3 — Documentation and Closing

- [x] T3.1 — Sync CHANGELOG and closeout evidence.
- [x] T3.2 — Feature registry: not applicable; repository maintenance is not a product feature.
- [x] T3.3 — No Mermaid blocks changed.
- [ ] T3.4 — Update this spec status to `implemented`.
- [ ] T3.5 — Commit the closeout on `chore/branch-retirement`.
- [ ] T3.6 — Record limitations and residual risk.

## Acceptance Criteria Verification Log

| AC | Status | Evidence (how it was verified) |
|----|--------|--------------------------------|
| AC-01 | ✅ | All 13 canonical branches have zero commits ahead of `development`; no merge was required. |
| AC-02 | ⏳ | Pending cleanup. |
| AC-03 | ⏳ | Pending cleanup. |
| AC-04 | ⏳ | Pending cleanup. |
| AC-05 | ⏳ | Pending final verification. |

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| | | |
