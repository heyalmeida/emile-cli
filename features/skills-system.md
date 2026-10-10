# Feature: Skills System

| Field | Value |
|-------|-------|
| **Status** | `active` |
| **Delivery date** | 2026-08-30 |
| **Source spec** | `specs/2026-08-30-skill-relevance` + `specs/2026-10-skills-agents-dir` (canonical root) |
| **PRD RFs served** | RF-10, RF-12 |
| **Owner/Area** | Skills / Prompt |

## Description

Workspace skills are loaded from `.agents/skills/` — the one canonical root, spelled the way the wider agent-CLI ecosystem spells it, so Emile reads the same directory you maintain — and can be selected explicitly or detected from project structure. In automatic mode, Emile injects only skills whose name or description is relevant to the current task, reducing unrelated prompt context while retaining the baseline `clean-code` skill.

## Technical Details

| Item | Detail |
|------|---------|
| **CLI flags** | `-s, --skills <list>`; explicit lists bypass relevance filtering |
| **Configuration** | `.agents/skills/<name>/SKILL.md` (single root; no legacy fallback) |
| **Applicable security gates** | Bounded per-skill (8k) and total (24k) prompt caps |

## Where It Lives in the Code

| Layer | Main paths |
|-------|------------|
| Detection/selection | `src/skills.js` |
| Prompt integration | `src/agent/agent.js`, `src/prompt.js` |

## Known Limitations

Matching is intentionally lexical and uses only skill name/description metadata; semantic similarity and provider-specific ranking are out of scope.

## Change History

| Date | Change | Reference |
|------|--------|-----------|
| 2026-08-30 | Added task-relevance filtering with explicit selection bypass | Source spec / CHANGELOG |
| 2026-10-09 | Fixed the discovery path (`loadAllSkills` scanned `.agent/.agents/.skills/skills`, never finding anything) to the documented `.agent/skills/`; vendored the `clean-code` starter skill and stopped gitignoring `.agent/`; regression suite `test/skills-load.test.js` | `specs/2026-10-08-skills-path-fix` / CHANGELOG |
| 2026-10-10 | **Canonical workspace skills root moved to `.agents/skills/`** (the ecosystem spelling): `loadAllSkills()` scans that one root, the vendored `clean-code` starter moved with it and stays versioned through an explicit `.gitignore` parent-chain negation, `.agent/` is gitignored again and no longer read, and the suites learned the new path plus a negative probe that the former root is not scanned | `specs/2026-10-skills-agents-dir` / CHANGELOG |
