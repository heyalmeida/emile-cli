# Tasks: Canonical workspace skills root moves to `.agents/`

> Fill in from the `plan.md`. Each task must be small, verifiable and traceable to an acceptance criterion (AC). Mark `- [x]` only after verifying.

| Field | Value |
|-------|-------|
| **Spec** | `2026-10-skills-agents-dir` |

---

## Phase 0 — Preparation

- [x] T0.1 — Read the relevant documentation (README skills section, `docs/architecture.md`, `docs/glossary.md`, `docs/deep-dive.md` § 9, `features/skills-system.md`, the P0-2/P1-5 briefs) — *Rule 1*
- [x] T0.2 — Confirm the spec/plan are approved
- [x] T0.3 — Classify risk (Low, discovery path only) and map the surfaces
- [x] T0.4 — Confirm the branch is `development`; preserve the user's in-flight `.gitignore` change (their `.agent/` line) — *Rule 8*
- [x] T0.5 — Probe the filesystem: `.agents/skills/` holds the kit (21 skills, all with `SKILL.md`), `.agent/skills/` holds a duplicate (22, including the vendored `clean-code`), and `git ls-files .agent` shows exactly one tracked file

## Phase 1 — Implementation

- [x] T1.1 — `src/skills.js`: scan `<workspaceDir>/.agents/skills/`, with the module comment recording the one-canonical-root decision — *(AC-01)*
- [x] T1.2 — `.gitignore`: `.agents/*` + parent-chain negations so the vendored starter stays tracked, keeping the user's `.agent/` rule — *(AC-03)*
- [x] T1.3 — `git mv .agent/skills/clean-code/SKILL.md .agents/skills/clean-code/SKILL.md` (content untouched) — *(AC-02)*
- [x] T1.4 — Verify tracking empirically: `git check-ignore -v` (starter unignored, other kit files ignored) and `git ls-files .agents` (starter listed)

## Phase 2 — Testing, Security and Verification

- [x] T2.1 — Update the fixtures of `test/skills-load.test.js` and `test/skills-cap.test.js` to the canonical root — *(AC-04)*
- [x] T2.2 — Add the negative probe (a skill only in `.agent/skills/` is not discovered, and `-s` cannot reach it) — *(AC-01)*
- [x] T2.3 — Add the tracked-starter assertion (parses, has description, discovered from the repo root) — *(AC-02)*
- [x] T2.4 — `node --check src/skills.js`; skills suites (`skills-load`, `skills-cap`, `skill-relevance`, `skills-picker`) green — *(AC-04)*
- [x] T2.5 — Direct probe at the repo root: 22 skills discovered, `clean-code` present
- [x] T2.6 — `npm test` and `npm run lint` — *(AC-04)*

## Phase 3 — Documentation and Closing

- [x] T3.1 — Rule 2 sync: `CHANGELOG.md` (Changed, marked BREAKING + migration line), `README.md` (feature list, Skills section, runtime-dirs note, project structure, contributor checklist, kit note), `docs/architecture.md` (skills row + runtime directories), `docs/glossary.md`, `features/skills-system.md` (+ Change History), `docs/deep-dive.md` (§ 9.2 update note, § 9.3 root list, § 21 P0-2 superseded note) — *(AC-05)*
- [x] T3.2 — Feature registry updated (`features/skills-system.md` — an improvement to an existing feature, not a new file) — *Rule 7*
- [x] T3.3 — P1-5 brief root list corrected so a future agent cannot reintroduce `.agent/skills/`
- [x] T3.4 — Mermaid: none added or edited
- [x] T3.5 — Spec status set to `implemented`
- [x] T3.6 — Committed on `development` with explicit paths (mandatory: `.agent/` holds ~18 000 untracked user files)
- [x] T3.7 — Handoff records the breaking change, the untouched `.agent/` copy and the files not edited (`.clinerules`, `.zcodeignore`)

---

## Acceptance Criteria Verification Log

| AC | Status | Evidence (how it was verified) |
|----|--------|--------------------------------|
| AC-01 | ✅ | `test/skills-load.test.js` — "a skill living only in the former `.agent/skills/` root is NOT discovered": `loadAllSkills()` returns only `clean-code`, and `compileSkills(['legacy-only'])` produces no block. |
| AC-02 | ✅ | `test/skills-load.test.js` — "the vendored clean-code starter is discovered from the tracked root" parses `.agents/skills/clean-code/SKILL.md` (name + non-empty description/content) and finds it via `loadAllSkills()` at the repo root. Manual probe: 22 skills discovered, `clean-code` included. `git ls-files .agents` lists the starter. |
| AC-03 | ✅ | `git check-ignore -v .agents/skills/clean-code/SKILL.md` → no output (not ignored); `git check-ignore -v .agents/skills/figma/SKILL.md` → `.gitignore:146:.agents/skills/*`; `git status` records the move as `R .agent/skills/clean-code/SKILL.md -> .agents/skills/clean-code/SKILL.md`. |
| AC-04 | ✅ | `node --check src/skills.js` OK; skills suites 15/15; `npm test` **470 tests / 460 pass / 0 fail / 10 env skips** (before: 468/458); `npm run lint` 0 errors (144 pre-existing warnings, unchanged). |
| AC-05 | ✅ | Eight files inspected after the edit: CHANGELOG, README, `docs/architecture.md`, `docs/glossary.md`, `features/skills-system.md`, `docs/deep-dive.md`, the P1-5 brief (+ this spec folder). |

> Legend: ⏳ pending / ✅ verified / ❌ failed (go back to implementation)

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| (this commit) | `feat(skills): read the canonical .agents/skills root` | `src/skills.js`, `.gitignore`, `.agents/skills/clean-code/SKILL.md` (moved), `test/skills-load.test.js`, `test/skills-cap.test.js` |
| (this commit) | `docs(skills): document the .agents/skills canonical root` | `CHANGELOG.md`, `README.md`, `docs/architecture.md`, `docs/glossary.md`, `docs/deep-dive.md`, `features/skills-system.md`, the P1-5 brief, `specs/2026-10-skills-agents-dir/` |

## Notes for the handoff

- The former `.agent/skills/` copy (21 skill directories, ~18 000 files) is left **untouched on disk** and is now gitignored; it is no longer read. Deleting it is the owner's call.
- `.clinerules:17` still describes the generic kit (agents/skills/workflows) as living in `.agent/`. That file is the workspace process authority and untracked, so it was **not** edited; the "skills" half of that sentence is now stale.
- `.zcodeignore:139` (a third-party tool's file) lists `.agent/`; not edited.