# Plan: Canonical workspace skills root moves to `.agents/`

| Field | Value |
|-------|-------|
| **Spec** | `2026-10-skills-agents-dir` |
| **Status** | `implemented` |

---

## 1. Technical Approach

1. **One canonical path.** `loadAllSkills()` composes
   `path.join(config.workspaceDir, '.agents', 'skills')`. No constant is
   introduced: there is exactly one call site, and the multi-root list that would
   justify an abstraction is P1-5's deliverable, not this change. No fallback to
   `.agent/skills/` is added — two roots would re-create the ambiguity that
   `2026-10-08-skills-path-fix` closed (its brief: "one canonical path").
2. **Keep the vendored starter versioned.** `clean-code` is pushed
   unconditionally by `detectWorkspaceSkills()`, so the repository must keep
   shipping it. The file moves with `git mv` from
   `.agent/skills/clean-code/SKILL.md` to `.agents/skills/clean-code/SKILL.md`
   (identical content — the byte-for-byte contract of the starter is preserved),
   and `.gitignore` gains the parent-chain negations needed for git to re-include
   a path whose ancestors are excluded.
3. **`/skills` packet.** The user's `.agents/skills/` kit (21 skills with a
   `SKILL.md` each) becomes visible to auto mode, `/skills` and `-s` with no code
   change beyond the path.
4. **Docs.** Every statement of the path is updated, including the P1-5 brief's
   ordered root list, so a future agent cannot reintroduce `.agent/skills/` as
   the project root.

## 2. Architectural Compliance

- **Relevant ADR(s):** ADR-0001 (no build step, ES modules) — unchanged; no new
  dependency. No ADR required: the change does not create an architectural
  decision, it aligns a filesystem convention with the documented one.
- **Architecture document:** the `skills.js` module row and the runtime-directory
  table both name the skills path and are updated in the same commit.
- **Design system:** not applicable — nothing renders differently; the only
  user-visible change is which skills are discovered.

## 3. Security and Threat Model

| Element | Handling |
|----------|------------|
| Command execution and whitelist | Not applicable — `loadAllSkills()` only reads directories inside `config.workspaceDir`. |
| File writes and `resolveSafePath` | Not applicable — no runtime write. Skill content never reaches a path/exec gate. |
| LLM inputs (prompt injection / tool args) | Unchanged: skill bodies are user-authored and already injected with the 8k/skill and 24k total caps (`compileSkills`); the canonical path does not widen what can be injected beyond the workspace root the user already controls. |
| Secrets (API keys, sessions, exports) | Not applicable. |
| Controls and negative tests | AC-01 pins that a skill present only under `.agent/skills/` is NOT loaded (no accidental double root); AC-03 pins the git tracking of the vendored starter. |

## 4. Impacted Modules

| Module | Path | Change |
|--------|---------|---------|
| Skills discovery | `src/skills.js` | Scan path `.agent` → `.agents` (+ JSDoc). |
| Version control | `.gitignore` | `.agents/` becomes a parent-chain negation set so the vendored starter stays tracked; `.agent/` is ignored again (the CLI no longer reads it). |
| Vendored starter | `.agents/skills/clean-code/SKILL.md` | Moved (content unchanged). |
| Tests | `test/skills-load.test.js`, `test/skills-cap.test.js` | Fixtures and labels use `.agents/skills`. |
| Docs | `README.md`, `docs/architecture.md`, `docs/glossary.md`, `docs/deep-dive.md`, `features/skills-system.md`, `CHANGELOG.md`, P1-5 brief | Path statements updated (Rule 2). |

## 5. Impacted Flags / Slash Commands / Tools

| Type | Name | Change |
|------|------|--------|
| CLI flag | `-s, --skills` | None (values are still skill names, not paths) |
| Slash command | `/skills` | None (lists what discovery returns — now the `.agents/` kit) |
| Tool | — | None |
| MCP | — | None |

## 6. Files to Create/Modify

| Action | Path (expected) | Notes |
|------|--------------------|-------------|
| Create | `specs/2026-10-skills-agents-dir/{spec,plan,tasks}.md` | SDD record (Rule 3). |
| Modify | `src/skills.js` | The one-line path + its comment. |
| Modify | `.gitignore` | Tracking rules for the new canonical root. |
| Move | `.agent/skills/clean-code/SKILL.md` → `.agents/skills/clean-code/SKILL.md` | `git mv`, content untouched. |
| Modify | `test/skills-load.test.js`, `test/skills-cap.test.js` | Fixtures + the describe label + the header comment. |
| Modify | `CHANGELOG.md`, `README.md`, `docs/architecture.md`, `docs/glossary.md`, `docs/deep-dive.md`, `features/skills-system.md`, `specs/2026-10-08-deep-dive-backlog/briefs/p1-5-skills-multi-root.md` | Rule 2 sync. |

## 7. Technical Decisions (summary)

1. **One root, no fallback.** The `-s`/auto-detection semantics, `parseSkillFile`
   and the caps are untouched; only the composed directory changes.
2. **The vendored starter travels with the convention.** Keeping `clean-code` at
   `.agent/skills/` while the code reads `.agents/skills/` would reproduce the
   P0-2 failure (fresh clone → zero skills) in a new shape.
3. **`.agent/` goes back to being unversioned.** P0-2 removed it from
   `.gitignore` *only* to vendor the starter there; that reason disappears with
   the move, and the directory is now a local leftover (the CLI does not read it).
4. **The user's files are not touched.** The `.agent/skills/` copy stays on disk;
   deleting or moving it is the owner's call, reported in the handoff.

## 8. Verification Strategy and Gates

| AC | Verification |
|----|--------------|
| AC-01 | `test/skills-load.test.js` — discovery through `.agents/skills` + a negative probe (a skill only under `.agent/skills` is not returned). |
| AC-02 | Direct probe: `loadAllSkills()` at the repository root returns `clean-code` from the tracked path. |
| AC-03 | `git check-ignore -v .agents/skills/clean-code/SKILL.md` (must be unignored) and `git ls-files .agents` (must list the starter). |
| AC-04 | `node --check src/skills.js`; `node --test test/skills-load.test.js test/skills-cap.test.js test/skill-relevance.test.js test/skills-picker.test.js`; `npm test`; `npm run lint`. |
| AC-05 | Inspection of the six documents + the brief. |

## 9. Git Workflow

| Item | Answer |
|------|--------|
| **Working branch** | `development` — no switch, no branch, no worktree (Rule 8). |
| **Commit plan** | (1) code + file move + `.gitignore` + tests; (2) docs sync (including the spec folder). Explicit paths only, never `git add .` — mandatory here, since `.agent/` holds ~18 000 untracked user files. |

## 10. Failures, Partial State and Rollback

| Topic | Strategy |
|------|------------|
| Error handling and user-facing messages | Unchanged: a missing skills directory returns `[]` silently (existing behaviour), a malformed `SKILL.md` warns and is skipped. |
| Interruption (Ctrl+C / Esc) and readline state | Not applicable — no interactive surface changes. |
| Partial state (session, undo stack, file cache) | None; the change is read-only at runtime. |
| Rollback / undo | Revert the commit and move the starter back; no persisted format changed. |

## 11. Technical Risks and Trade-offs

| Risk | Likelihood | Mitigation |
|-------|---------------|-------------|
| The `.gitignore` negation is written in a way git ignores (parent-chain rule). | Medium | Verified with `git check-ignore -v` + `git ls-files` before committing (AC-02/AC-03). |
| Existing workspaces silently lose their skills. | Certain for `.agent/skills/` users | CHANGELOG breaking-change entry + README note with the one-line remedy; multi-root (P1-5) is the eventual general answer. |
| A worktree with only `.agent/skills/` (the pre-change layout) now reports zero skills with no explanation. | Low | Reported; a discovery hint is a UX change belonging to the error-UX front, not smuggled in here. |