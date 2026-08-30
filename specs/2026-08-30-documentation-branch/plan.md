# Plan: Dedicated documentation branch

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-30-documentation-branch` |
| **Status** | `implemented` |

## 1. Technical Approach

Create `docs/documentation` from `development`, update the workflow source of
truth and its mirrors, add the code-branch mapping to `features/README.md`,
then publish the branch. No application files are touched.

Documentation scope includes `README.md`, `CONTRIBUTING.md`, `docs/`,
`features/`, `specs/`, `CHANGELOG.md`, `.clinerules` and `AGENTS.md` when the
change is process documentation. Product-code branches contain source, tests
and implementation-only commits; their documentation work is committed on
`docs/documentation` and later integrated into `development`.

## 2. Architectural Compliance

- No runtime architecture or dependency changes.
- No visual or terminal UI changes.
- The branch policy remains compatible with the development-first topology.

## 3. Security and Threat Model

| Element | Handling |
|----------|------------|
| Command execution | No application command execution changes. |
| File writes | Documentation-only targeted patches. |
| Secrets | No secret-bearing files are added; `.env` and `.emile/` remain ignored. |
| Negative tests | Verify no `src/` or `test/` file is part of the commit. |

## 4. Impacted Modules

| Module | Path | Change |
|--------|---------|---------|
| Workflow rules | `.clinerules` | Add documentation-branch policy. |
| Contributor docs | `CONTRIBUTING.md`, `README.md` | Document commands and scope. |
| SDD docs | `specs/README.md`, `specs/_templates/` | Route documentation commits to the docs branch. |
| Feature registry | `features/README.md` | Add canonical code-branch mapping. |
| Glossary/changelog | `docs/glossary.md`, `CHANGELOG.md` | Define and record the workflow. |

## 5. Impacted Flags / Slash Commands / Tools

Not applicable.

## 6. Files to Create/Modify

| Action | Path (expected) | Notes |
|------|--------------------|-------------|
| Create | `specs/2026-08-30-documentation-branch/` | SDD record. |
| Modify | `.clinerules`, `CONTRIBUTING.md`, `README.md`, `specs/README.md`, `specs/_templates/plan.md`, `specs/_templates/tasks.md`, `features/README.md`, `docs/glossary.md`, `CHANGELOG.md` | Documentation sync. |
| Git ref | `docs/documentation` | New documentation branch. |

## 7. Technical Decisions (summary)

- Documentation is centralized in one branch to keep code branches focused.
- `CHANGELOG.md`, specs and feature registry are documentation artifacts and
  follow the documentation branch rule.
- The docs branch is created from `development`, never directly from `main`.

## 8. Verification Strategy and Gates

- Verify every feature row maps to an existing canonical branch.
- Verify docs branch and all canonical branches share the current
  `development` baseline before the docs commit.
- Verify staged files contain no `src/` or `test/` paths.
- Run `git diff --check` and confirm a clean worktree after commit.
- Application tests are not required because no runtime code changes occur.

## 9. Git Workflow

| Item | Answer |
|------|--------|
| **Feature branch** | `docs/documentation` |
| **Commit plan** | One documentation-only commit with explicit paths; publish and track the branch. |
