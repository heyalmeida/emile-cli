# Spec: Branch topology and feature naming migration

| Field | Value |
|-------|-------|
| **ID** | `2026-08-30-branch-topology-migration` |
| **Status** | `implemented` |
| **Phase/Context** | Repository workflow normalization |
| **Related documents** | [Contributing Guide](../../CONTRIBUTING.md), [PRD](../../docs/product.md), [ADR-0001](../../docs/adr/0001-tech-stack-choice.md) |

## 1. Problem / Motivation

The repository has feature branches named after individual incidents or
implementation steps (`feat/error-ux`, `fix/security-hardening`, and similar),
while the project is organized around stable product domains. The current
history is also a cumulative chain rather than a set of branches created from
an integration branch. This makes it difficult to discover where future work
belongs and to review the intended Git flow.

## 2. Goal

Establish `development` as the integration base and provide stable,
domain-oriented feature branches rooted at that base, while preserving the
existing commit history and legacy refs for rollback and auditability.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-----------|---------------------|
| RF-S01 | A local `development` branch must point to the current integrated project state without changing `main`. | Must |
| RF-S02 | Canonical branches must use stable product/workflow names and be created from `development`: `feat/ux-ui`, `feat/mcp-system`, `feat/system-prompt`, `feat/cli-commands`, `feat/model-system`, `feat/session-system`, `feat/plans-mode`, `feat/context-compression`, `feat/skills-system`, `feat/agent-loop`, `feat/tools-system`, `feat/project-rules` and `chore/quality-gates`. | Must |
| RF-S03 | Existing local and remote branch refs must remain recoverable under `archive/legacy/` before old names are removed. | Must |
| RF-S04 | Contributor documentation must describe `development` as the parent/integration base and the canonical naming scheme. | Must |
| RF-S05 | The migration must be verifiable with ancestry, ref-preservation and clean-worktree checks. | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|----------|
| **Risk classification** | Medium — branch ref changes can hide or remove recoverable work if performed incorrectly, although they do not modify tracked project files. |
| **Assets/secrets** | Git history, local refs and remote refs; no application secrets are read or changed. |
| **Command execution / file writes** | Git ref updates and documentation edits only. No application shell tool, workspace file handler or runtime command gate is changed. |
| **Untrusted inputs** | Branch names and remote state are read from Git and validated explicitly before ref updates. |
| **Negative criteria** | Never delete an old ref before its archive ref exists; never force-push `main` or `development`; abort if the worktree is dirty or an expected commit/ref is missing. |

## 5. Out of Scope

- Rewriting commit objects or cherry-picking the historical cumulative chain.
- Merging or deleting `main`.
- Changing application code, runtime behavior, dependencies or release tags.
- Requiring every completed product feature to have unique historical commits after the migration; the canonical branches are the clean starting points for future work.

## 6. Acceptance Criteria

- **AC-01:** Given a clean worktree, when the migration completes, then local `development` points to the integrated tip selected before migration and `main` is unchanged.
- **AC-02:** Given the canonical branch list, when each branch is inspected, then its tip is a descendant of `development` and its name describes a stable product domain.
- **AC-03:** Given every old branch ref selected for migration, when the old name is removed, then an `archive/legacy/<old-name>` ref exists at the exact same commit.
- **AC-04:** Given a contributor reading the workflow documentation, when they create new work, then the documented command starts it from `development` and uses the canonical naming rules.
- **AC-05:** Given the final repository, when the verification commands run, then ref checks pass, `main` remains unchanged, the worktree is clean, and no untracked migration artifact is left behind.

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|--------|--------------------|
| Remote branch deletion may be denied by protection rules. | Medium | Create canonical and archive refs first; report any deletion that the remote rejects. |
| A remote branch may have advanced since the local inventory. | High | Re-fetch and compare exact tips immediately before remote mutation; abort on drift. |
| “Parent branch” can be misunderstood as a Git object relationship. | Low | Document that commits have parents; a feature branch is rooted from the current `development` tip. |

## 8. References

- [Contributing Guide](../../CONTRIBUTING.md)
- [Git Workflow rules](../../AGENTS.md)
- [Feature catalog](../../features/README.md)
- [SDD process](../README.md)
