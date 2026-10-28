# BRIEF P0-5 — Scrub secrets from the environment of every tool-executed subprocess

> Read first: `specs/2026-10-08-deep-dive-backlog/_shared-constraints.md` and `docs/deep-dive.md` § 22.3 (security row) + § 12.

## Goal

`runCommand` executes with FULL environment inheritance: `exec(shellCommand, { cwd, timeout })` (`src/tools/handlers/run-command.js:94`) passes no `env`, so any command the model or user runs — including a `npm install` postinstall script or a fetched `curl | sh` payload — can read `OPENROUTER_API_KEY`, `REQUESTY_API_KEY`, `OPENCODE_API_KEY`, and every other `*KEY*/*TOKEN*/*SECRET*` var in the process environment. grok-build scrubs by default (`grok: xai-grok-sandbox/src/command/policy.rs:138-156`: exclude globs `*KEY* *SECRET* *TOKEN* *PASSWORD* *CREDENTIAL* *_PAT LD_PRELOAD LD_LIBRARY_PATH DYLD_*`, then an allowlist). Close the same hole in ~20 lines.

## Current behavior (facts, verified 2026-10-09)

- `run-command.js:94` — no `env` option → child inherits everything.
- The MCP path already has an env allowlist concept (`src/mcp.js`, consent + allowlist per § 12) — mirror the spirit, not the mechanism.
- `config.js` reads provider keys from `process.env` at startup (`ENV_KEY_MAP`, `:68-73`); the emile process itself keeps its env — only the CHILD env is scrubbed.
- Windows env names are case-insensitive; the scrub must match case-insensitively on the NAME.

## Required design (do not re-derive; implement this)

1. New exported helper `buildScrubbedEnv(baseEnv)` in `src/tools/security.js` (it is the security module; run-command already imports from it):
   - Start from a shallow copy of `baseEnv` (default `process.env`).
   - DELETE any name matching, case-insensitively: `/KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL/`, `/(_|^)PAT$/` (GitHub PAT style `GH_TOKEN` is already caught by TOKEN; `*_PAT` catches GitLab), `/^LD_PRELOAD$/`, `/^LD_LIBRARY_PATH$/`, `/^DYLD_/`, and any name starting with `EMILE_` EXCEPT none are needed by children (drop all `EMILE_*`).
   - KEEP allowlist untouched otherwise (PATH, HOME, USERPROFILE, SYSTEMROOT, COMSPEC, TEMP, LANG, …) — deny-by-pattern, not allow-by-list, to avoid breaking arbitrary builds.
2. `run-command.js` passes `env: buildScrubbedEnv(process.env)` to `exec`.
3. Document the policy in the function's JSDoc: "children of tool-executed commands must never see provider credentials; the model's own commands are untrusted input."
4. `isSafeCommand`, the metacharacter gate, safe-mode confirm and dry-run are UNCHANGED (shared constraints #1).

## Tests to add (new file `test/subprocess-env-scrub.test.js`)

- Unit: `buildScrubbedEnv({ PATH:'x', OPENROUTER_API_KEY:'k', Requesty_Api_KEY:'k', GH_TOKEN:'t', GITLAB_PAT:'p', LD_PRELOAD:'evil', DYLD_INSERT_LIBRARIES:'evil', MYAPP_COLOR:'ok' })` deletes the five secrets (case-insensitive) and keeps PATH/MYAPP_COLOR.
- Integration (the real gate): set `process.env.EMILE_TEST_SCRUB_KEY = 'SENTINEL'`-style secret name matching the pattern (e.g. `OPENROUTER_API_KEY`), run `runCommand` with a command that prints the env (`node -e "console.log(JSON.stringify(process.env))"` — safe-mode off in the test, same pattern as `test/run-command.test.js`), assert the sentinel value is absent from the result and `PATH` is present. Must pass on Windows and POSIX.
- Negative: a non-matching var (`EMILE_NOT_SET` — any name not matching the patterns) survives, proving deny-by-pattern doesn't nuke the environment.

## Constraints

- Do not scrub the emile process's own env; do not touch `config.js` resolution.
- No new dependencies. MCP child env handling is out of scope (it has its own allowlist).

## Verification

`node --check src/tools/security.js src/tools/handlers/run-command.js && node --test test/subprocess-env-scrub.test.js && npm run lint && npm test`

## Docs sync (Rule 2)

- CHANGELOG `[Unreleased]` → Fixed: tool-executed subprocesses no longer inherit provider credentials (env scrub).
- `docs/code-quality-and-security.md`: add the scrub to the command-execution layer description.
- `docs/deep-dive.md` § 12 and § 22.3: mark applied.
