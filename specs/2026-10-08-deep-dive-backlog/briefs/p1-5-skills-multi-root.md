# BRIEF P1-5 — Skills multi-root: global + project + config dirs, namespaced packages

> Read first: `specs/2026-10-08-deep-dive-backlog/_shared-constraints.md`, `docs/deep-dive.md` § 9.2–9.3. **Depends on P0-2** (path fix + `loadAllSkills` refactor must land first).

## Goal

Skills are workspace-only today (and, before P0-2, effectively nonexistent). Implement the multi-root design with machine-global roots so a skill installed once works in every workspace, plus per-project overrides and user-configured extra dirs.

## Required design

1. New `listSkillRoots()` in `src/skills.js` returning ordered roots (first match wins; later same-name roots are shadowed):

```
1. <workspace>/.emile/skills      5. ~/.emile/skills
2. <workspace>/.agent/skills      6. ~/.agents/skills
3. <workspace>/.claude/skills     7. ~/.claude/skills
4. <workspace>/.zcode/skills      8. config.skillsDirs[] (in order)
```

2. `config.skillsDirs`: array of extra directory paths in `~/.emile/config.json` (validation: strings, absolute or `~`-expanded via `os.homedir()`; drop invalid with `warn()`). Optional flag `--skills-dir <path>` repeatable in `src/cli.js` options → merged into the runtime list (flag entries land in slot 8 after config entries).
3. `loadAllSkills()` iterates ALL roots. Each root supports two layouts:
   - `<root>/<skill>/SKILL.md` (current format, `parseSkillFile` unchanged);
   - `<root>/<plugin>/<skill>/SKILL.md` → skill name becomes `plugin:skill` (namespaced). Bare skill names never contain `:`.
4. Dedupe by name across roots with root-order precedence; collect shadowed names for the UI. `-s` explicit lists and auto-detection must resolve `plugin:skill` names correctly (`filterSkillsByRelevance`, `compileSkills` — extend matching to allow the full `plugin:skill` string as the requested name).
5. `/skills` command (`src/commands/handlers.js:409-419` + `printSkillsInfo` in `ui/skills-panel.js`): show source root (global/local) per skill and list shadows as one dim line (`shadowed by local: <name>`). Picker unchanged otherwise.
6. Cache by root mtime (precedent: `src/rules.js:28,71-79`): a per-root `{ mtime, skills }` module-level cache; readdir when unchanged is still fine, but parse only when the root's mtime changed.

## Constraints

- **Cache-key invariant** (deep-dive § 9.3.1): skills enter the frozen system-prompt prefix; the `(plansMode, relevantSkills)` key in `agent.js:225` must keep working unchanged. New roots only affect turns where a new skill becomes relevant. Verify `compileSkills` output for an unchanged skill set is byte-identical to today.
- Skills content is untrusted input, same trust level as rules: parse, truncate by the existing caps (8k/skill, 24k total, `skills.js:207-208`), never execute.
- Symlink escape: roots themselves are user config (trusted), but a SKILL.md must be a regular file — reuse the realpath discipline of `rules.js:30-34` if you add confinement checks.

## Tests to add (`test/skills-multi-root.test.js`)

- Temp home + temp workspace: skill in `~/.emile/skills` is discovered in any workspace; same name in workspace wins (precedence); `plugin:skill` namespaced discovery; `skillsDirs` extra root; invalid `skillsDirs` entries dropped.
- `compileSkills` with `plugin:skill` requested by `-s` includes it.

## Verification

`node --check src/skills.js src/config.js && node --test test/skills-multi-root.test.js test/skills-load.test.js && npm run lint && npm test`

## Docs sync (Rule 2)

- CHANGELOG `[Unreleased]` → Added: multi-root skill discovery (global + project + `skillsDirs`, `plugin:skill` namespacing).
- `README.md` skills section: list the roots in precedence order.
- `docs/deep-dive.md` § 9.3: mark applied.
- `docs/architecture.md` § 2 skills.js row: update description (multi-root).
