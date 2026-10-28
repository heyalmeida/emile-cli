# BRIEF P0-2 — Skills path fix + decide the origin of bundled skills

> Read first: `specs/2026-10-08-deep-dive-backlog/_shared-constraints.md` and `docs/deep-dive.md` § 9.1.

## Goal

`loadAllSkills()` (`src/skills.js:50-74`) scans a nonsense composed path so **zero skills load today**:

```js
// skills.js:51 — produces <workspace>/.agent/.agents/.skills/skills
const skillsDir = path.join(config.workspaceDir, '.agent', '.agents', '.skills', 'skills');
```

Repository docs promise `.agent/skills/` (`README.md:178,296`, `docs/architecture.md` § 2). Additionally `.gitignore:139-140` ignores `.agent/` and `.agents/`, so a fresh clone ships no skill files even after the path fix, while `README.md:34,180` promises "40+ built-in skills".

## Required changes

1. **Fix the scan path** in `loadAllSkills()`: scan `<workspace>/.agent/skills/` (single directory, exactly what the docs describe). Keep the same return shape `{ name, description, content }[]`.
2. **Vendor a starter skill set**: create `.agent/skills/clean-code/SKILL.md` — the code hard-requires `clean-code` in `detectWorkspaceSkills()` (`skills.js:140-142`), so at minimum that skill must exist and be versioned. Content: short coding standards (read-before-write, no placeholders, verify changes) — you write it, ~40 lines, English.
   - Remove `.agent/` from `.gitignore` (keep `.agents/` ignored if it is legacy). This is a documented decision — record it in the spec.
3. **Multi-path tolerance**: `loadAllSkills()` should also scan `.agent/.agents/.skills/skills/` ONLY IF you find evidence it was ever intentional (search the repo docs/specs). Default expectation: do NOT keep it — one canonical path.
4. Do NOT implement global roots or config-driven dirs in this brief (that is P1-5, separate).

## Tests to add (`test/skills-load.test.js`)

- Point `config.workspaceDir` at a temp dir (pattern used by `test/security.test.js` for isolated homes); create `.agent/skills/clean-code/SKILL.md` with frontmatter; assert `loadAllSkills()` returns 1 skill with parsed name/description.
- Assert missing dir returns `[]` without throwing.

## Constraints

- `parseSkillFile`, `filterSkillsByRelevance`, `compileSkills` behavior unchanged.
- No changes to `prompt.js`, `agent.js`.

## Verification

`node --check src/skills.js && node --test test/skills-load.test.js && npm run lint && npm test`

## Docs sync (Rule 2)

- CHANGELOG `[Unreleased]` → Fixed: skills never loaded (composed path bug) + vendored `clean-code`.
- `README.md`: only if the "40+" claim remains false after vendoring (we ship 1 skill) — adjust the wording to "ships with a starter skill set; add yours in `.agent/skills/`". Do not leave a false claim.
- `docs/deep-dive.md` § 9.1: mark path bug fixed.
