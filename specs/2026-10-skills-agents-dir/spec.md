# Spec: Canonical workspace skills root moves to `.agents/`

| Field | Value |
|-------|-------|
| **ID** | `2026-10-skills-agents-dir` |
| **Status** | `implemented` |
| **Phase/Context** | Maintenance — skills discovery path (follows P0-2 and the P2-10 doc refresh) |
| **Related documents** | [architecture](../../docs/architecture.md), [glossary](../../docs/glossary.md), [deep-dive § 9](../../docs/deep-dive.md), [features/skills-system.md](../../features/skills-system.md), [README](../../README.md) |

---

## 1. Problem / Motivation

`loadAllSkills()` (`src/skills.js:51`) scans `<workspace>/.agent/skills/`, a path
fixed by `specs/2026-10-08-skills-path-fix` (P0-2) only to replace a nonsensical
nested composition (`.agent/.agents/.skills/skills`). The owner's decision is now
explicit: **`.agents/` is the convention every agent CLI uses** (ZCode/Claude
ecosystem), and the workspace kit on this machine already lives in
`<workspace>/.agents/skills/` (21 skills), while `<workspace>/.agent/skills/`
holds a duplicate copy plus the single vendored starter (`clean-code`). The CLI
is therefore reading the wrong twin: skills the user maintains in `.agents/` are
invisible to the agent.

## 2. Goal

`<workspace>/.agents/skills/` is the one canonical workspace skills root, and a
fresh clone still discovers the vendored `clean-code` starter there — so auto
mode keeps the skill the code hard-requires.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-----------|---------------------|
| RF-S01 | `loadAllSkills()` scans `<workspaceDir>/.agents/skills/` and nothing else: one canonical path, no legacy fallback and no multi-root list (that is P1-5). | Must |
| RF-S02 | The vendored starter skill that the code requires (`clean-code`, pushed unconditionally by `detectWorkspaceSkills()`) moves to `.agents/skills/clean-code/SKILL.md` and stays **versioned**, so a fresh clone loads it. | Must |
| RF-S03 | `.gitignore` keeps the local kit unversioned (`.agents/` is a bring-your-own directory) while still tracking the vendored starter, and stops tracking/flagging `.agent/` now that the CLI no longer reads it. | Must |
| RF-S04 | Every surface that documents the path — README, `docs/architecture.md`, `docs/glossary.md`, `features/skills-system.md`, `docs/deep-dive.md` and the P1-5 multi-root brief — names `.agents/skills/`. | Must |
| RF-S05 | The existing skills suites cover the new path; no case is removed or weakened. | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|----------|
| **Risk classification** | **Low** — a discovery-path constant plus the git tracking rules for that path. No command execution, no path resolution outside the workspace, no credential or session surface. |
| **Assets/secrets** | Not applicable — skill files are user-authored markdown already injected into the system prompt under an existing 8k/24k cap; nothing new is read or written. |
| **Command execution / file writes** | Not applicable — `loadAllSkills` only reads. The change writes no file at runtime; the repository move is a version-control operation. |
| **Untrusted inputs** | Unchanged: skill bodies keep going through the existing parse/truncate/cap path; a malformed `SKILL.md` is still skipped with a `warn()`. |
| **Negative criteria** | Must not introduce a second scanned root (no silent fallback that would resurrect the two-twin ambiguity), must not stop tracking the vendored starter, and must not delete any user file: the local `.agent/skills/` copy is left on disk untouched. |

## 5. Out of Scope

- **P1-5 multi-root** (`listSkillRoots()`, global roots, `plugin:skill` namespacing, `config.skillsDirs`, `--skills-dir`): not implemented here; only its documented root list is corrected.
- Migrating user data: the local `.agent/skills/` directory is **not** moved, deleted or rewritten.
- The skill relevance model, the 8k/24k caps, `parseSkillFile`, `/skills` rendering.
- `.clinerules` (workspace process authority, untracked) and `.zcodeignore` (a third-party tool's file) are reported, not edited.

## 6. Acceptance Criteria

- **AC-01:** Given a workspace with `.agents/skills/<name>/SKILL.md`, when `loadAllSkills()` runs, then it returns that skill; given a skill only in `.agent/skills/`, then it is **not** returned (one canonical root).
- **AC-02:** Given a fresh clone of the repository, when `loadAllSkills()` runs at the repo root, then `clean-code` is discovered from the tracked `.agents/skills/clean-code/SKILL.md`.
- **AC-03:** Given the repository, when `git check-ignore` / `git ls-files` are run, then `.agents/skills/clean-code/SKILL.md` is tracked and **not** ignored, while any other file under `.agents/` and anything under `.agent/` is ignored.
- **AC-04:** Given `npm test`, then the skills suites pass on the new path and the full suite exits 0.
- **AC-05:** Given the change, then CHANGELOG, README, `docs/architecture.md`, `docs/glossary.md`, `features/skills-system.md`, `docs/deep-dive.md` and the P1-5 brief name `.agents/skills/`.

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|---------|--------------------|
| Workspaces that keep skills in `.agent/skills/` (including any copy of this repo) stop loading them. | Silent behaviour change for existing users. | Recorded as a **breaking change** in the CHANGELOG with the one-line remedy (move the directory to `.agents/`). The owner's kit already lives in `.agents/`. The alternative (silent fallback to `.agent/skills/`) is rejected: it re-creates the two-twin ambiguity this spec closes. |
| Git cannot re-include a file whose parent directory is excluded. | The vendored starter could silently become untracked → a fresh clone loads zero skills (the exact P0-2 bug). | The ignore rule is written as `.agents/*` plus explicit parent-chain negations, and **verified** with `git check-ignore -v` and `git ls-files` (AC-02/AC-03). |
| The local kit has two copies on disk, so the user may keep editing the stale one. | Confusion after the change. | Reported in the handoff (the `.agent/` copy is untouched by design — no user data is deleted by this spec). |

## 8. References

- Product/architecture documents consulted: `docs/architecture.md` (module table + runtime directories), `docs/glossary.md` (Skill), `README.md` (Skills section, project structure, contributor checklist), `docs/deep-dive.md` § 9.1–9.3 and § 21, `features/skills-system.md`, `.clinerules` Rules 0–9.
- Prior specs: `specs/2026-10-08-skills-path-fix` (P0-2 — established `.agent/skills/` and vendored the starter), `specs/2026-10-08-readme-refresh` (P2-10 — documented that path).
- Follow-up: `specs/2026-10-08-deep-dive-backlog/briefs/p1-5-skills-multi-root.md` (root list corrected to `.agents/skills`).