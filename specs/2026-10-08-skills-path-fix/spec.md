# Spec: Skills discovery path fix + vendored clean-code starter skill

| Field | Value |
|-------|-------|
| **ID** | `2026-10-08-skills-path-fix` |
| **Status** | `implemented` |
| **Phase/Context** | Deep-dive backlog P0-2 (skills) |
| **Related documents** | [architecture.md § 2](../../docs/architecture.md), [features/skills-system.md](../../features/skills-system.md), deep-dive § 9.1 |

---

## 1. Problem / Motivation

`loadAllSkills()` composes its scan root as `<workspace>/.agent/.agents/.skills/skills`
(`src/skills.js:51`) — a nested path that exists nowhere, so zero skills load in
every workspace, ever. `docs/architecture.md` (skills.js row) and the README
declare skills live in `.agent/skills/` with auto mode retaining `clean-code`,
but even a correctly placed skill would be invisible to git because
`.gitignore` excludes `.agent/` entirely. Deep-dive § 9.1 documents both facts.

## 2. Goal

A fresh clone of this repo discovers `.agent/skills/clean-code` via
`loadAllSkills()`; auto mode retains `clean-code` (matching the architecture
doc's contract); the vendored skill tree is tracked by git.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-----------|---------------------|
| RF-S01 | `loadAllSkills()` scans exactly `<workspace>/.agent/skills/`, one root, no config | Must |
| RF-S02 | Repo vendors `.agent/skills/clean-code/SKILL.md` with YAML frontmatter (`name`, `description`, `keywords`) and bounded English clean-code guidance | Must |
| RF-S03 | `.gitignore` stops ignoring `.agent/` so `.agent/skills/**` is tracked; `.agents/` and `.clinerules` exclusions remain | Must |
| RF-S04 | Regression suite `test/skills-load.test.js` covers: discovery+metadata, explicit `-s` bypass of relevance filtering, auto-detection retains `clean-code`, malformed SKILL.md skipped with a `warn()` without throwing, and the 8k/24k caps | Must |
| RF-S05 | Cache-stable prompt machinery (`agent/agent.js:225` key) is unchanged | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|----------|
| **Risk classification** | Medium — skills become part of the system prompt (LLM input); loading mechanism must not leak volatility into the prompt cache |
| **Assets/secrets** | None in the vendored skill (no keys, no env, no tool instructions) |
| **Command execution / file writes** | None added; skills are parsed read-only (existing `parseSkillFile`) |
| **Untrusted inputs** | Skill files stay untrusted, same trust level as rules: parsed, capped (8k/skill, 24k total), never executed, no shell-outs from parsing |
| **Negative criteria** | Malformed SKILL.md never throws (skipped with `warn()`); bodies over 8k truncated; total over 24k bounded; no multi-root/global roots in this brief |

## 5. Out of Scope

- Multi-root discovery, global roots, `plugin:skill` namespacing, `skillsDirs`
  (deep-dive § 9.3 / P1-5).
- `~/.claude/skills`, `~/.emile/skills` or any other root: single workspace root.
- Any skill-content redesign beyond the `clean-code` starter needed for auto mode.

## 6. Acceptance Criteria

| ID | Criterion |
|----|-----------|
| AC-01 | `loadAllSkills()` in a fresh clone discovers `.agent/skills/clean-code` |
| AC-02 | Auto-detection retains `clean-code` (matches `docs/architecture.md` skills.js row) |
| AC-03 | `.agent/` no longer ignored by `.gitignore`; the vendored SKILL.md is tracked |
| AC-04 | `test/skills-load.test.js` passes with all scenarios |
| AC-05 | All gates green (`node --check`, `node --test`, `npm run lint`, `npm test`); CHANGELOG updated |
