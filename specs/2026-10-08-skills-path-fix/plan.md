# Plan: Skills discovery path fix + vendored clean-code starter skill

| Field | Value |
|-------|-------|
| **Spec** | `2026-10-08-skills-path-fix` |
| **Status** | `implemented` |

---

## 1. Technical Approach

Single-line fix in `src/skills.js`: the scan root becomes
`path.join(config.workspaceDir, '.agent', 'skills')`. Everything downstream of
`loadAllSkills()` (parsing, relevance filtering, compilation, caps) stays as is.
The starter skill is a plain `SKILL.md` vendored under `.agent/skills/clean-code/`,
picked up by the existing auto-detection (`detectWorkspaceSkills` always appends
`clean-code`). `.gitignore` drops the `.agent/` exclusion only.

## 2. Architectural Compliance

- **ADR(s):** none new — this makes the shipped architecture doc's contract
  true; no architectural decision changes.
- **architecture.md:** the skills.js row already declares the contract
  (`.agent/skills/`, auto retains `clean-code`); the Runtime directories table
  already describes `.agent/` as the generic agent kit. Both stay valid; the
  skills tree under `.agent/skills/` becomes tracked content of the same table.
- **Design system:** no visual change.

## 3. Security and Threat Model

| Element | Handling |
|----------|------------|
| Command execution and whitelist | Not applicable — parsing only, no shell-outs |
| File writes and `resolveSafePath` | Not applicable (read-only scanning) |
| LLM inputs (prompt injection / tool args) | Skill bodies are untrusted, same trust level as rules: parsed with js-yaml, capped 8k/skill and 24k total by the existing constants, injected as plain text instructions, never executed |
| Secrets (API keys, sessions, exports) | None read; vendored skill contains none |
| Controls and negative tests | Malformed SKILL.md → `warn()` + skip (existing behavior, now covered by a test); oversize bodies truncated; total bounded |

## 4. Impacted Modules

| Module | Path | Change |
|--------|---------|---------|
| Skills | `src/skills.js` | scan root `.agent/.agents/.skills/skills` → `.agent/skills` |
| VCS | `.gitignore` | remove `.agent/` exclusion, keep `.agents/`, `.clinerules`, `.emile/` |
| Vendored content | `.agent/skills/clean-code/SKILL.md` | new starter skill |
| Tests | `test/skills-load.test.js` | new regression suite |
| Docs | `CHANGELOG.md`, `docs/deep-dive.md`, `features/skills-system.md` | sync (Rule 2/7) |

## 5. Impacted Flags / Slash Commands / Tools

| Type | Name | Change |
|------|------|--------|
| CLI flag | `-s, --skills` | Behavior unchanged; a fresh clone now actually resolves `clean-code` |
| Slash command | `/skills` | Now lists the vendored skill in a fresh clone |
| Tool | — | Not applicable |

## 6. Files to Create/Modify

| Action | Path (expected) | Notes |
|------|--------------------|-------------|
| Modify | `src/skills.js` | scan root composition (line 51) |
| Create | `.agent/skills/clean-code/SKILL.md` | starter skill, frontmatter + bounded body |
| Modify | `.gitignore` | un-ignore `.agent/` |
| Create | `test/skills-load.test.js` | 5 test scenarios |
| Create | `specs/2026-10-08-skills-path-fix/` | this spec pack |
| Modify | `CHANGELOG.md`, `docs/deep-dive.md`, `features/skills-system.md` | docs sync |

## 7. Technical Decisions (summary)

1. **Single root only** — `.agent/skills/`; multi-root is P1-5 and must not be
   pre-implemented.
2. **Un-ignore `.agent/` wholesale** rather than `.agent/skills/**` only: the
   directory is the documented generic agent kit home and the gitignore
   "Project Files" block keeps ignoring `.agents/`, `.emile/` and
   `.clinerules`, so nothing sensitive becomes tracked by this change
   (verified: the repo tree under `.agent/` contains only the vendored skill).
3. **Vendored skill content is bounded English guidance** (no tool
   instructions, no secrets) because it feeds the cache-stable prompt prefix.
4. **No cache-machinery change** — the loading mechanism stays deterministic
   for a fixed skill set; the prompt key changes only when the skill SET
   changes, which is expected.

## 8. Verification Strategy and Gates

- `node --check src/skills.js`
- `node --test test/skills-load.test.js` (positive, explicit bypass, auto
  detect, malformed skip, caps — negative/boundary scenarios)
- `node --check` on every touched file; `npm run lint`; `npm test`
- Fresh-clone simulation: temp copy of the repo checkout without `.agent/`
  loading through `loadAllSkills()` (covered by the temp-workspace test)
- No new dependency (`js-yaml` already the parser); no `npm audit` needed.

## 9. Git Workflow

| Item | Answer |
|------|--------|
| **Working branch** | `development` — no switch, no worktree (Rule 8) |
| **Commit plan** | 1) spec + code + test + `.gitignore` + vendored skill; 2) docs sync (CHANGELOG, deep-dive, features). Explicit paths only |

## 10. Failures, Partial State and Rollback

| Topic | Strategy |
|------|------------|
| Error handling and user-facing messages | `parseSkillFile` already warns and skips; unchanged |
| Interruption (Ctrl+C / Esc) and readline state | Not applicable (no UI change) |
| Partial state (session, undo stack, file cache) | Not applicable |
| Rollback / undo | Revert the single commit; `.gitignore` and vendored skill are additive |

## 11. Technical Risks and Trade-offs

| Risk | Likelihood | Mitigation |
|-------|---------------|-----------|
| Prompt cache key shifts for users with existing `.agent/skills` | None | The path was broken: nobody had skills loading; the key changes only when the skill set changes (expected) |
| Skill files with secrets vendored by mistake | Low | Only `.agent/skills/**` content is vendored; reviewed at commit time; tests cover parse/skip behavior |
| Unrelated `.agent/` content becoming tracked later | Low | `.agents/` (plural) stays ignored; `.agent/` tree is auditable in review |
