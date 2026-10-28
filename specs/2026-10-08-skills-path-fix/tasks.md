# Tasks: Skills discovery path fix + vendored clean-code starter skill

| Field | Value |
|-------|-------|
| **Spec** | `2026-10-08-skills-path-fix` |

---

## Phase 0 — Preparation

- [x] T0.1 — Read relevant documentation (architecture.md skills rows, features/skills-system.md, deep-dive § 9.1, `.clinerules`) — *Rule 1*
- [x] T0.2 — Confirm spec and plan are written (self-approved brief execution; brief = verified facts F1–F6)
- [x] T0.3 — Classify risk (Medium — untrusted skill content into the system prompt; caps preserved, negative tests required)
- [x] T0.4 — Confirm branch is `development` and inspect `git status` — Rule 8

## Phase 1 — Implementation

- [x] T1.1 — Create this spec pack (`spec.md`, `plan.md`, `tasks.md`) — *verifies process Rule 3*
- [x] T1.2 — Fix `src/skills.js:51` scan root to `path.join(config.workspaceDir, '.agent', 'skills')`; grep for other references to the broken path (none). Precision note: the broken composition existed only as an uncommitted working-tree regression — HEAD (`ad7cc43`) already carried the correct path, so the working tree ended up matching HEAD and `src/skills.js` needed no commit — *verifies AC-01*
- [x] T1.3 — Vendor `.agent/skills/clean-code/SKILL.md` (frontmatter: name, description, keywords; bounded English body, no tool instructions, no secrets) — *verifies AC-02*
- [x] T1.4 — Remove the `.agent/` exclusion from `.gitignore` (keep `.agents/`, `.emile/`, `.clinerules`, `grok-build/`) — *verifies AC-03*
- [x] T1.5 — Create `test/skills-load.test.js`: discovery+metadata; explicit `-s clean-code` bypasses relevance filtering; auto-detection retains `clean-code`; malformed SKILL.md skipped with `warn()`; 8k/24k caps truncate/bound — *verifies AC-04*

> Commit as each coherent unit completes, staging ONLY this feature's files (Rule 8). Record the commit hashes below.

## Phase 2 — Testing, Security and Verification

- [x] T2.1 — Run the full suite and record counts: `npm test` — 324 tests, 314 pass, 0 fail (10 skipped: POSIX-only/symlink-privilege environment skips), `test/skills-load.test.js` 5/5; `npm test` exits 0
- [x] T2.2 — Gates: `node --check src/skills.js` ✓; `node --check src/tools/handlers/run-command.js` (from the pre-brief test fixes) ✓; `node --test test/skills-load.test.js` ✓; `npm run lint` → 0 errors (144 pre-existing warnings)
- [x] T2.3 — `npm audit`: not applicable — no new dependency (js-yaml already in `package.json`)
- [x] T2.4 — Verify all ACs one by one (log below)

## Phase 3 — Documentation and Closing

- [x] T3.1 — Rule 2 sync: `CHANGELOG.md` `[Unreleased]` → Fixed entry
- [x] T3.2 — Update `features/skills-system.md` Change History (Rule 7 — existing feature, improvement to the same feature)
- [x] T3.3 — CHANGELOG entry recorded (same as T3.1)
- [x] T3.4 — No Mermaid blocks touched
- [x] T3.5 — Spec status → `implemented`
- [x] T3.6 — Docs commit on `development`, explicit paths only
- [x] T3.7 — Handoff records: P1-5 (multi-root, `skillsDirs`, `plugin:skill`, global roots) intentionally NOT pulled in; smoke test of the full REPL deferred (skills path covered by unit suite)

---

## Acceptance Criteria Verification Log

| AC | Status | Evidence (how it was verified) |
|----|--------|--------------------------------|
| AC-01 | ✅ | `test/skills-load.test.js` "discovers the vendored clean-code skill" (temp workspace with `.agent/skills/clean-code/SKILL.md`) |
| AC-02 | ✅ | `filterSkillsByRelevance([], prompt)` includes `clean-code` (test 3); `detectWorkspaceSkills` always appends it |
| AC-03 | ✅ | `git check-ignore .agent/skills/clean-code/SKILL.md` → not ignored; `git status` shows the vendored file as untracked-to-be-added |
| AC-04 | ✅ | `node --test test/skills-load.test.js` — 5 pass, 0 fail |
| AC-05 | ✅ | Gates recorded in T2.2; CHANGELOG updated |

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| ff92e04 | `test: make the suite runnable on Windows without symlink privilege` | `src/tools/handlers/run-command.js` + 7 test files (pre-brief suite fixes, separate unit) |
| 7ccac7c | `fix(skills): correct discovery path and vendor clean-code starter` | `.gitignore`, `.agent/skills/clean-code/SKILL.md`, `test/skills-load.test.js`, spec pack |
| (docs commit) | `docs(skills): sync changelog, deep-dive and skills feature registry for P0-2` | `CHANGELOG.md`, `docs/deep-dive.md`, `features/skills-system.md`, this file |
