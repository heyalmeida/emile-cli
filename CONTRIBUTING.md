# Contributing Guide — emile-cli

## 👋 Welcome!

Emile is a terminal coding agent: provider-agnostic (any OpenAI-compatible API), with built-in tools, MCP, prompt caching, reasoning control, plans mode and a skills system. Contributions — code, documentation, UI, skills — are welcome.

> **Read this first:** the mandatory rules in [`.clinerules`](./.clinerules) govern the entire process below (they apply to AI agents and describe *why* the process exists — human contributors should follow the same discipline).

---

## 🔄 Git Workflow (single development branch)

**All ongoing work is made directly on `development`.** `main` remains the
release/integration branch.

Before a task, inspect the current branch and working tree:

```bash
git branch --show-current
git status --short
```

Do not routinely switch branches, create feature branches or worktrees, pull,
merge, rebase, reset, clean or stash. Those operations require the user's
explicit request. Code, specs, documentation, feature registry and CHANGELOG
updates all live and are committed on `development`.

### Commit discipline

- Commit as soon as a **coherent unit** of the feature is done — don't pile everything into one giant commit.
- **Stage only the files related to that feature.** Never `git add .` or `git add -A`; never mix unrelated concerns in one commit:

```bash
git status                           # review the working tree
git add src/tools.js src/api.js      # explicit paths only
git diff --cached --stat             # verify the staged set
git commit -m "fix(tools): reject ambiguous editFile matches"
```

- **Unrelated changes** found while working (a bug in another module, a stray file): don't commit them with the current change — report them, or handle them in a separate commit later.
- Do not merge, delete branches, or change remote state unless asked.

---

## 📐 Development Flow (SDD)

This project follows **Spec-Driven Development** — no implementation starts without a spec ([`specs/README.md`](./specs/README.md)):

1. Confirm `development` is the current branch and preserve the working tree.
2. Open or confirm the applicable spec in `specs/` (`spec.md` → `plan.md` → `tasks.md`). Trivial bugs can go straight to the fix; features can't.
3. Classify the risk per [Code Quality and Security](./docs/code-quality-and-security.md).
4. Implement and verify with the gates proportional to the risk (below), committing per coherent unit.
5. Sync documentation, feature registry and CHANGELOG on `development` where applicable.
6. Record the spec reference in the scoped commit; open a pull request only when requested.

### Commit message convention ([Conventional Commits](https://www.conventionalcommits.org/))

`type(scope): short description` — types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`.
Examples: `feat(ui): render /cost in a box`, `fix(tools): block path traversal in editFile`.

---

## ⚙️ Local Setup

**Prerequisites:** Node.js >= 18, npm, Git. No API key is needed to run the CLI, but one is needed for real tasks (wizard on first run).

```bash
git clone https://github.com/heyalmeida/emile-cli.git
cd emile-cli
npm install
node bin/emile.js --verbose   # run from source with debug output
```

**There is no build step** — the project runs pure ES modules. Configure provider/key via the wizard, env vars (`EMILE_PROVIDER`, `*_API_KEY`) or user-global `~/.emile/config.json`. Confirmed user memory lives separately in `~/.emile/memory/v1/`; workspace runtime data stays in the gitignored `.emile/` directory.

---

## ✅ Current Gates

The repository exposes repeatable project-wide `npm test` and `npm run lint`
gates. Run them before opening a pull request, together with the syntax and
smoke checks relevant to the files changed.

```bash
node --check src/<file.js>     # syntax of every touched file
node --test test/*.test.js     # equivalent native test command
npm test                       # project-wide regression suite
npm run lint                   # ESLint for src/, test/ and bin/
node bin/emile.js --verbose    # smoke test with a simple task
npm audit                      # when there is a new dependency
```

- **Tools/execution (high risk):** mandatory negative scenarios — command outside the whitelist, `../` path, dry-run writes nothing, failure becomes an error to the model.
- **Global agent memory (high risk):** follow ADR-0004 and its implemented spec; cover dedicated-root confinement, corrupt/torn state, concurrent locks, source/privacy validation, transient context/history redaction, instruction precedence and complete application-level deletion.
- **UI:** verify 60/80/120 columns, no ANSI leakage, [design system](./docs/visual-identity.md#6-visual-review-checklist) checklist.
- **Without recorded evidence, the change is not tested** — describe in the PR the commands run, results and limitations.

---

## 📐 Code Style

- **Plain JavaScript, ES modules, no TypeScript/build** (ADR-0001). Introducing a build step requires a new ADR.
- **Single responsibility per module** (`src/`), mapped in [`docs/architecture.md`](./docs/architecture.md).
- **Isolated UI:** all rendering goes through `src/ui.js` and uses the `C` palette — never picocolors directly in other modules.
- **Naming:** code in English; documentation also in English (open-source project).
- **Errors:** no empty `catch`; messages orient the user; never expose stacks, API keys or secrets.
- **Security is non-negotiable:** safe mode, dry-run, the whitelist and `resolveSafePath` can never be loosened to "make it work".

---

## 🔐 Security, Secrets and Dependencies

- Never commit `.emile/`, `.env`, API keys or session dumps.
- New dependencies require justification, official origin, maintenance/license review, lockfile and a recorded `npm audit`.
- Report real vulnerabilities privately — don't open an issue with a reproducible exploit.

---

## 📝 On Completion (Definition of Done)

A contribution is only ready when:

- [ ] It fulfills the spec (or the original bug report)
- [ ] It passed the gates proportional to the risk, with evidence in the PR
- [ ] Affected documentation was synced (Rule 2 of `.clinerules`)
- [ ] New/changed features have a `features/` registry entry (Rule 7)
- [ ] `CHANGELOG.md` received the entry
- [ ] Code and documentation were committed directly on `development` in coherent, explicitly staged units (Rule 8)
- [ ] No Critical/High finding was left untreated
