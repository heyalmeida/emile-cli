# Spec: Dedicated documentation branch

| Field | Value |
|-------|-------|
| **ID** | `2026-08-30-documentation-branch` |
| **Status** | `implemented` |
| **Phase/Context** | Repository workflow normalization |
| **Related documents** | [Branch topology migration](../2026-08-30-branch-topology-migration/spec.md), [Contributing Guide](../../CONTRIBUTING.md) |

## 1. Problem / Motivation

The repository has stable code branches per product domain, but the workflow
does not yet state where documentation changes belong. Documentation updates
can therefore be mixed into a feature implementation branch, making branch
scope and review ownership ambiguous.

## 2. Goal

Create `docs/documentation` as the single branch for repository documentation
and make the workflow explicit: code changes stay on their product branch,
while documentation changes are committed on the documentation branch.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-----------|---------------------|
| RF-S01 | A `docs/documentation` branch must be created from `development`. | Must |
| RF-S02 | `.clinerules` must require documentation-only commits on `docs/documentation`, including README, docs, specs, feature registry, CHANGELOG and workflow rules. | Must |
| RF-S03 | Contributor and SDD documentation must describe the separation between code branches and the documentation branch. | Must |
| RF-S04 | The feature catalog must map every product feature to its canonical code branch. | Must |
| RF-S05 | The documentation branch must be published and track `origin/docs/documentation`. | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|----------|
| **Risk classification** | Low — process/documentation changes and a branch ref only; no runtime or secret-bearing behavior changes. |
| **Assets/secrets** | Git refs and documentation; no API keys or user data. |
| **Command execution / file writes** | Git ref creation and targeted Markdown edits only. |
| **Untrusted inputs** | Not applicable. |
| **Negative criteria** | Do not alter source code, do not commit documentation in a product branch, and do not change `main` or `development` history. |

## 5. Out of Scope

- Moving existing application commits between branches.
- Changing runtime behavior, dependencies or CLI commands.
- Automatically merging documentation into every feature branch.

## 6. Acceptance Criteria

- **AC-01:** Given `development` as the integration base, when the branch is created, then `docs/documentation` is rooted at its current tip.
- **AC-02:** Given a documentation change, when it is committed, then the workflow identifies `docs/documentation` as its branch and excludes product-code branches.
- **AC-03:** Given the feature catalog, when each entry is inspected, then it names the canonical code branch responsible for that feature.
- **AC-04:** Given the repository workflow documents, when contributors read them, then the code/documentation branch split is consistent across rules, README, CONTRIBUTING and SDD templates.
- **AC-05:** Given the remote repository, when refs are inspected, then `docs/documentation` exists and tracks the published branch.

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|--------|--------------------|
| Documentation may describe code not yet merged into `development`. | Low | Documentation branch may be based on `development`; merge code and docs through their respective reviewed branches. |
| Contributors forget to switch branches. | Medium | Add explicit commands and a completion checklist to `.clinerules` and CONTRIBUTING. |

## 8. References

- [SDD process](../README.md)
- [Feature catalog](../../features/README.md)
