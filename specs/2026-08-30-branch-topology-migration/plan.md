# Plan: Branch topology and feature naming migration

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-30-branch-topology-migration` |
| **Status** | `implemented` |

## 1. Technical Approach

Use the current integrated commit on the working branch as the migration
baseline. Create a migration branch for the documentation change, create or
fast-forward local `development` to that baseline, then create canonical
feature refs from `development`. Existing refs are copied to matching
`archive/legacy/...` refs before their user-facing names are retired. No
commit objects are rewritten.

The canonical domains map to the product catalog as follows:

| Branch | Product scope |
|--------|---------------|
| `feat/ux-ui` | Terminal UI, reasoning display and user-facing interaction |
| `feat/mcp-system` | MCP discovery, transport and tool visibility |
| `feat/system-prompt` | System prompt and project instruction composition |
| `feat/cli-commands` | Slash-command dispatch and undo commands |
| `feat/model-system` | Model catalog, provider metadata and reasoning budgets |
| `feat/session-system` | Persistence, retention and session resilience |
| `feat/plans-mode` | Plans-mode behavior and safeguards |
| `feat/context-compression` | Context measurement and adaptive compression |
| `feat/skills-system` | Skill discovery and relevance filtering |
| `feat/agent-loop` | Agent orchestration and loop safeguards |
| `feat/tools-system` | Built-in tools and execution safety |
| `feat/project-rules` | `.emilerules` and compatible rule discovery |
| `chore/quality-gates` | Lint, test and open-source maintenance gates |

## 2. Architectural Compliance

- **Relevant ADR(s):** ADR-0001 remains applicable; no runtime architecture or dependency changes are introduced.
- **Architecture document:** no `src/` module responsibility changes. The contributor workflow documentation is updated to match the repository topology.
- **Design system:** not applicable; no terminal rendering changes.

## 3. Security and Threat Model

| Element | Handling |
|----------|------------|
| Command execution and whitelist | Not applicable to the application; Git commands are run directly by the maintainer and limited to explicit refs. |
| File writes and `resolveSafePath` | Not applicable to runtime tools; documentation changes are applied with targeted patches. |
| LLM inputs (prompt injection / tool args) | Not applicable. |
| Secrets (API keys, sessions, exports) | No secret-bearing files are staged or inspected. |
| Controls and negative tests | Clean-worktree precondition, exact tip inventory, archive-before-delete, no force push, ancestry checks and main immutability check. |

## 4. Impacted Modules

| Module | Path | Change |
|--------|---------|---------|
| Contributor workflow | `CONTRIBUTING.md` | Document `development`-first branching and canonical domains. |
| Project workflow rules | `AGENTS.md` / `.clinerules` | Align Rule 8 with the new parent branch and naming policy. |
| Project overview | `README.md` | Align the Git workflow summary. |
| Domain glossary | `docs/glossary.md` | Define the integration branch and canonical feature branch. |
| Roadmap/process | `docs/roadmap.md` | Record workflow normalization as delivered foundation work. |
| SDD records | `specs/2026-08-30-branch-topology-migration/` | Record requirements, plan, tasks and evidence. |

## 5. Impacted Flags / Slash Commands / Tools

Not applicable. No CLI flag, slash command, built-in tool or MCP contract changes.

## 6. Files to Create/Modify

| Action | Path (expected) | Notes |
|------|--------------------|-------------|
| Create | `specs/2026-08-30-branch-topology-migration/{spec,plan,tasks}.md` | SDD record and verification evidence. |
| Modify | `AGENTS.md`, `CONTRIBUTING.md`, `README.md`, `docs/glossary.md`, `docs/roadmap.md`, `CHANGELOG.md` | Workflow synchronization. |
| Modify | `.clinerules` if it is not a symlink to `AGENTS.md` | Keep the mandatory rule source consistent. |
| Git refs | local and remote branch refs | Create canonical branches and archive legacy refs. |

## 7. Technical Decisions (summary)

1. Do not rewrite historical commit objects; historical branch tips are
   preserved under `archive/legacy/`.
2. Use the current integrated state as the new `development` baseline so new
   feature branches do not start from an obsolete integration point.
3. Treat a feature branch as “child of development” when it is created at or
   after the current `development` tip and its work is based on that ref.
4. Do not force-push protected branches. Remote operations are explicit and
   performed only after the local ref graph passes verification.

## 8. Verification Strategy and Gates

- Verify the pre-migration worktree is clean and record the baseline tip.
- Verify `main` remains at its original commit.
- Verify every canonical branch is at the selected `development` tip and that
  `git merge-base --is-ancestor development <branch>` succeeds.
- Verify every migrated old ref and its archive ref resolve to the same commit.
- Verify no legacy user-facing branch remains after remote/local retirement.
- Run `git fsck --no-reflogs --no-progress` only if available and without
  treating unrelated repository warnings as migration failures.
- No `node --check` or application smoke test is required because no source
  file or runtime behavior changes; run the repository status check instead.

## 9. Git Workflow

| Item | Answer |
|------|--------|
| **Feature branch** | `chore/branch-topology`, created from the current integrated working tip. |
| **Commit plan** | One documentation/spec commit, followed by explicit Git ref operations. Never stage with a wildcard. |

## 10. Failures, Partial State and Rollback

| Topic | Strategy |
|------|------------|
| Ref creation failure | Stop immediately; existing refs remain untouched. |
| Archive failure | Do not delete or retire the corresponding old ref. |
| Remote drift/protection | Stop remote deletion; retain both refs and report the exact rejected operation. |
| Rollback / undo | Restore a branch name from its `archive/legacy/...` ref with `git branch -m` or recreate the ref at the recorded commit. No commit object is deleted by this migration. |

## 11. Technical Risks and Trade-offs

| Risk | Likelihood | Mitigation |
|-------|-----------|------------|
| Canonical branches initially have no new commits beyond the integrated baseline. | Certain | This is intentional: they are clean starting points for future domain work; legacy branches preserve completed-history pointers. |
| Remote branch permissions reject deletion or creation. | Medium | Complete local migration and retain remote refs if the server rejects a ref update. |
| Contributors interpret archive refs as active work. | Low | Document `archive/legacy/` as read-only historical refs. |
