# Spec: Retire orphaned branch refs after topology migration

| Field | Value |
|-------|-------|
| **ID** | `2026-08-30-branch-retirement` |
| **Status** | `approved` |
| **Phase/Context** | Repository workflow cleanup follow-up |
| **Related documents** | [Branch topology migration](../2026-08-30-branch-topology-migration/spec.md), [Contributing Guide](../../CONTRIBUTING.md) |

## 1. Problem / Motivation

The topology migration created canonical domain branches and preserved the
former names as temporary `archive/legacy/*` refs. Those refs are now
redundant for the active workflow and inflate the repository's branch count.
The migration branch itself is also complete and is not a product-domain
branch.

## 2. Goal

Retire only the redundant archive and migration refs, preserve `development`,
`main` and every canonical domain branch, and confirm that all canonical
branches have no unmerged work before cleanup.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-----------|---------------------|
| RF-S01 | Preserve `main`, `development` and all 13 canonical domain branches. | Must |
| RF-S02 | Confirm every canonical branch has zero commits ahead of `development` before cleanup. | Must |
| RF-S03 | Remove the 22 remote `archive/legacy/*` refs and the temporary remote `chore/branch-topology` ref only after confirming their contents are reachable from `development` or the user-approved backup. | Must |
| RF-S04 | Remove matching local archive refs and the temporary local migration ref without touching canonical refs. | Should |
| RF-S05 | Document that no merge commit is needed because canonical branches already point at the `development` tip. | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|----------|
| **Risk classification** | Medium — branch deletion can remove convenient refs, so exact target validation and the user's external backup are required. |
| **Assets/secrets** | Git refs and commit reachability; no application secrets. |
| **Command execution / file writes** | Git ref deletion and documentation edits only. No application execution or runtime file write. |
| **Untrusted inputs** | Branch names are explicit allowlisted targets from the pre-cleanup inventory. |
| **Negative criteria** | Never delete `main`, `development` or a canonical branch; abort if any canonical branch contains unique commits or any target ref differs from the audited inventory. |

## 5. Out of Scope

- Rewriting commits or force-pushing any branch.
- Deleting a canonical branch or changing application files.
- Deleting old local branches that were not part of the audited migration set.

## 6. Acceptance Criteria

- **AC-01:** Given the audited canonical list, when compared to `development`, then each branch has zero unique commits and no merge is required.
- **AC-02:** Given the explicit orphan target list, when cleanup completes, then those local and remote refs are absent.
- **AC-03:** Given the protected/canonical list, when cleanup completes, then all 13 canonical branches, `development` and `main` remain unchanged.
- **AC-04:** Given the final remote, when branch count is inspected, then only active branches plus `main`, `development` and the cleanup workflow branch remain; no `archive/legacy/*` refs remain.
- **AC-05:** Given the repository, when verification runs, then the worktree is clean, `main` matches `origin/main`, and all canonical branches are based on `development`.

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|--------|--------------------|
| Historical archive refs are removed. | Medium | The user confirmed an external backup; the commits are also reachable from the integrated development history where applicable. |
| Canonical branches may acquire work between audit and deletion. | High | Re-fetch immediately before deletion and abort if any canonical tip differs from `development`. |

## 8. References

- [Branch topology migration spec](../2026-08-30-branch-topology-migration/spec.md)
- [SDD process](../README.md)
