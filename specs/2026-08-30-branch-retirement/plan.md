# Plan: Retire orphaned branch refs after topology migration

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-30-branch-retirement` |
| **Status** | `approved` |

## 1. Technical Approach

1. Re-fetch `origin` and capture the exact current tips.
2. Compare every canonical branch with `development`; merge only if a
   canonical branch contains unique commits. The current audit predicts zero
   such commits.
3. Confirm `main` and `development` are protected from deletion.
4. Delete the explicit list of 22 remote archives and remote
   `chore/branch-topology` atomically; delete their local counterparts after
   remote success. Delete only local archives that have no remote counterpart
   as part of the same retired set.
5. Re-fetch/prune tracking refs and verify branch count, ancestry and clean
   status.

The remote archive `archive/legacy/fix/mcp-error-redaction` is not an
ancestor of `origin/development`, but its patch-id is identical to the
integrated `c65233d` change. It is therefore redundant rather than unique
work and is included in the approved retirement set.

## 2. Architectural Compliance

- No runtime architecture or product behavior changes.
- No visual or terminal UI changes.
- This is repository maintenance and follows the branch policy documented in
  `AGENTS.md` and `CONTRIBUTING.md`.

## 3. Security and Threat Model

| Element | Handling |
|----------|------------|
| Branch deletion | Explicit refspec allowlist, archive/backup confirmation and atomic remote deletion. |
| Force push | Forbidden; none is required. |
| Protected refs | `main`, `development` and all canonical refs are excluded from deletion. |
| Rollback | User backup plus Git object reachability; no commit rewrite. |

## 4. Impacted Modules

| Module | Path | Change |
|--------|---------|---------|
| Workflow record | `specs/2026-08-30-branch-retirement/` | Add follow-up requirements and evidence. |
| Changelog | `CHANGELOG.md` | Record branch cleanup. |

## 5. Impacted Flags / Slash Commands / Tools

Not applicable.

## 6. Files to Create/Modify

| Action | Path (expected) | Notes |
|------|--------------------|-------------|
| Create | `specs/2026-08-30-branch-retirement/{spec,plan,tasks}.md` | SDD follow-up. |
| Modify | `CHANGELOG.md` | Cleanup entry. |
| Git refs | explicit local and remote refs | Retire only orphaned targets. |

## 7. Technical Decisions (summary)

- Do not merge empty canonical branches; a fast-forward/no-op is already
  represented by the shared `development` tip.
- Keep canonical branches as future work starting points.
- Treat `archive/legacy/*` and `chore/branch-topology` as completed migration
  artifacts, not active development branches.

## 8. Verification Strategy and Gates

- `git rev-list --count development..<canonical>` equals zero for all 13.
- Every canonical branch is an ancestor of/at `development`; `main` is
  unchanged and matches `origin/main`.
- All explicit local/remote orphan refs are absent after cleanup.
- `git diff --check`, `git fsck --no-reflogs --no-progress` and clean status
  pass.
- No Node/application tests are required because no source/runtime files are
  changed.

## 9. Git Workflow

| Item | Answer |
|------|--------|
| **Feature branch** | `chore/branch-retirement` |
| **Commit plan** | One SDD/changelog closeout commit; explicit remote ref deletion and local ref cleanup. |

## 10. Failures, Partial State and Rollback

| Topic | Strategy |
|------|------------|
| Canonical drift | Abort before deletion; no refs are removed. |
| Remote deletion failure | Keep all refs and report the rejected target. |
| Local deletion failure | Remote cleanup remains valid; restore local refs from remote or backup if required. |
