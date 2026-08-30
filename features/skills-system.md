# Feature: Skills System

| Field | Value |
|-------|-------|
| **Status** | `active` |
| **Delivery date** | 2026-08-30 |
| **Source spec** | `specs/2026-08-30-skill-relevance` |
| **PRD RFs served** | RF-10, RF-12 |
| **Owner/Area** | Skills / Prompt |

## Description

Workspace skills are loaded from `.agent/skills/` and can be selected explicitly or detected from project structure. In automatic mode, Emile now injects only skills whose name or description is relevant to the current task, reducing unrelated prompt context while retaining the baseline `clean-code` skill.

## Technical Details

| Item | Detail |
|------|---------|
| **CLI flags** | `-s, --skills <list>`; explicit lists bypass relevance filtering |
| **Configuration** | `.agent/skills/<name>/SKILL.md` |
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
