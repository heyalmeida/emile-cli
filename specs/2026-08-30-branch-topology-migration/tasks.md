# Tasks: Branch topology and feature naming migration

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-30-branch-topology-migration` |

## Phase 0 — Preparation

- [x] T0.1 — Read README, product, architecture, security, glossary, ADRs, CONTRIBUTING and SDD templates — *Rule 1*.
- [x] T0.2 — Confirm the spec and plan are `approved`.
- [x] T0.3 — Classify the change as medium risk and define archive-before-delete and no-force-push controls.
- [x] T0.4 — Create/switch to `chore/branch-topology`.

## Phase 1 — Implementation

- [x] T1.1 — Record the baseline commit, branch refs and `main` tip (AC-01, AC-05). Baseline before the anchoring merge was `b8e3b6a`; `main` was `5173153`; remote drift was detected and preserved for `session-resilience` and `reasoning-details-display`.
- [x] T1.2 — Create/fast-forward local `development` to the integrated baseline without changing `main` (AC-01). A non-conflicting merge with `origin/development` produced `996c04b`, after which `development` was updated without force.
- [x] T1.3 — Create the canonical domain branches from `development` (AC-02). All 13 canonical branches point to `996c04b`.
- [x] T1.4 — Create local `archive/legacy/...` refs for every retired local branch before renaming/removal (AC-03). 24 local refs were preserved.
- [x] T1.5 — Publish canonical and archive refs remotely, then retire old remote names only after exact-tip verification (AC-02, AC-03). 13 canonical refs, 22 archive refs and `development` were published; 21 old remote names were removed atomically. Two old names had no remote ref and were not deleted.
- [x] T1.6 — Synchronize workflow documentation and changelog (AC-04).

## Phase 2 — Testing, Security and Verification

- [x] T2.1 — Verify canonical branch ancestry and exact baseline. `git merge-base --is-ancestor development <branch>` passed for all 13 branches; all resolve to `996c04b`.
- [x] T2.2 — Verify each archive ref matches the old branch tip recorded in the inventory. Local archives preserve all 24 local tips; remote archives preserve the exact remote tips, including the two detected divergences.
- [x] T2.3 — Verify `main` immutability and clean worktree. Local and remote `main` remain `5173153`; the worktree was clean before this closeout edit.
- [x] T2.4 — Verify all acceptance criteria one by one; results are recorded below.

## Phase 3 — Documentation and Closing

- [x] T3.1 — Sync Rule 2 documents: README, CONTRIBUTING, AGENTS/.clinerules, glossary, roadmap and CHANGELOG.
- [ ] T3.2 — Feature registry: not applicable; this is repository workflow maintenance, not a product feature.
- [x] T3.3 — Record the changelog entry.
- [x] T3.4 — Revalidate Mermaid blocks: no Mermaid block was changed.
- [x] T3.5 — Update the spec and plan status to `implemented`.
- [x] T3.6 — Commit the documentation sync on `chore/branch-topology`; the implementation commits are `b8e3b6a` and `996c04b`.
- [x] T3.7 — Record limitations, non-executed checks and residual risk in this file and the final handoff.

## Acceptance Criteria Verification Log

| AC | Status | Evidence (how it was verified) |
|----|--------|--------------------------------|
| AC-01 | ✅ | `development` is anchored at `996c04b`, `main` remains `5173153`, and no force-push was used. |
| AC-02 | ✅ | 13 canonical domain branches exist locally/remotely and resolve to the `development` baseline; ancestry checks passed. |
| AC-03 | ✅ | 24 local archive refs and 22 remote archive refs exist before old remote names were retired; exact remote drift was preserved. |
| AC-04 | ✅ | `.clinerules`, README, CONTRIBUTING, glossary, roadmap and CHANGELOG describe the development-first workflow. |
| AC-05 | ✅ | Ref inventory, archive checks, main immutability and clean-worktree checks passed; application gates were not applicable because no source/runtime code changed. |

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| `b8e3b6a` | `chore(workflow): normalize development-first branch topology` | Workflow docs and SDD artifacts |
| `996c04b` | `chore(workflow): anchor migration on development` | Merge anchor for existing development history |
