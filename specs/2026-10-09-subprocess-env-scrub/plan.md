# Plan: Subprocess environment scrub — tool-executed commands never inherit provider credentials

> Filled from the approved `spec.md`. The design is fixed by brief P0-5 and is
> not re-derived here; this document records how it lands.

| Field | Value |
|-------|-------|
| **Spec** | `2026-10-09-subprocess-env-scrub` |
| **Status** | `implemented` |

---

## 1. Technical Approach

Two files, roughly twenty lines, one new test suite.

1. **`buildScrubbedEnv(baseEnv = process.env)` in `src/tools/security.js`** (F5 —
   security.js is the module that already owns `isSafeCommand`, `resolveSafePath`
   and `normalizeWorkspaceCwd`, and `run-command.js` already imports from it).
   A deny-list of name patterns applied to a shallow copy:

   ```js
   const SCRUBBED_ENV_PATTERNS = [
     /KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL/i,          // credentials
     /(_|^)PAT$/i,                                            // GitLab-style *_PAT
     /^LD_PRELOAD$/i, /^LD_LIBRARY_PATH$/i, /^DYLD_/i,        // loader injection
     /^EMILE_/i,                                              // emile's own surface
   ];

   export function buildScrubbedEnv(baseEnv = process.env) {
     const env = { ...baseEnv };
     for (const name of Object.keys(env)) {
       if (SCRUBBED_ENV_PATTERNS.some((re) => re.test(name))) delete env[name];
     }
     return env;
   }
   ```

   Case-insensitive on the **name** (F3 / RF-S02). The input is never mutated
   (RF-S06): the copy is what gets scrubbed, so `process.env` keeps everything
   and `config.js` resolution is untouched (F2). No config, flag or env read
   inside — the control cannot be disabled (RF-S07).

2. **`run-command.js`** passes it to the one real `exec` call site:
   `exec(shellCommand, { cwd: commandCwd, timeout, env: buildScrubbedEnv(process.env) }, …)`.
   Computed per call, so it always reflects the current parent env.

3. **Nothing else changes.** `isSafeCommand`, `METACHARACTERS`, the safe-mode
   confirmation and network-pipe warning, dry-run and the cwd probe stay as they
   are (RF-S08/RF-S09).

**Why deny-by-pattern instead of an allowlist** (F6 / RF-S04): an allowlist of
"build-safe" variables is exactly what `mcp.js:29-43` does for *third-party* MCP
servers, where the server is untrusted and minimal is correct. Tool-executed
commands are the user's own builds — compilers, package managers, test runners,
Docker, cloud CLIs — which read dozens of variables an allowlist would not know
about (`SystemRoot`, `PATHEXT`, `COMSPEC`, `TMP`, `NUMBER_OF_PROCESSORS`,
`JAVA_HOME`, `ANDROID_SDK_ROOT`, `VCToolsInstallDir`, …). An allowlist would
break arbitrary builds; the patterns break only secrets.

**Windows note:** `process.env` in Node normalizes names, but a plain object
fixture (or a duplicated key from a non-Node parent) can carry mixed case, so the
match runs against the name with `/i`, and the test asserts both spellings.

## 2. Architectural Compliance

- **Relevant ADR(s):** ADR-0001 — pure ESM, **no new dependency**. ADR-0002 —
  quality gates: this ships with a dedicated `node:test` file plus the standard
  gates. No new ADR: the module map is unchanged (the control lives in the
  existing security module, in the layer that already owns command gating).
- **Architecture document:** `docs/architecture.md` already describes
  `src/tools/security.js` as the security layer and `run-command.js` as the
  execution handler; adding a child-env control there follows that assignment
  rather than changing it. No module table change needed.
- **Design system:** not applicable — no terminal rendering is touched.

## 3. Security and Threat Model

| Element | Handling |
|----------|------------|
| Command execution and whitelist | `isSafeCommand` + `METACHARACTERS` + safe-mode confirm unchanged. The scrub is a **second, independent** control that survives the case where the user approves the command: approving execution is not approving environment disclosure. |
| File writes and `resolveSafePath` | Not applicable — no path handling changed. |
| LLM inputs (prompt injection / tool args) | The command string is untrusted. Defense: even an approved or injected `env`/`set`/`printenv` or a dependency's postinstall script sees no credential. |
| Secrets (API keys, sessions, exports) | Removed before the child exists, so they can neither enter the tool result (which flows back into the model context) nor the persisted session JSON in `.emile/history/`. No new output surface; removed names and values are never logged. |
| Controls and negative criteria | AC-01/03/05 are the positive disclosures-that-must-not-happen checks; AC-02 is the negative "do not nuke the environment" check; AC-04 proves non-mutation of the parent; AC-06 proves no bypass exists. |

## 4. Impacted Modules

| Module | Path | Change |
|--------|---------|---------|
| Security (command gating) | `src/tools/security.js` | New exported `buildScrubbedEnv(baseEnv)` + the deny pattern table. Nothing else in the file touched. |
| Tool handler | `src/tools/handlers/run-command.js` | `exec` gains `env: buildScrubbedEnv(process.env)`; import extended. |
| Tests | `test/subprocess-env-scrub.test.js` | New file: unit matrix, case-insensitivity, non-mutation, integration env-dump, loader vars, EMILE_* probe regression. |
| Docs | `CHANGELOG.md`, `docs/code-quality-and-security.md`, `docs/deep-dive.md`, `features/built-in-tools.md` | Rule 2 / Rule 7.4 sync. |

## 5. Impacted Flags / Slash Commands / Tools

| Type | Name | Change |
|------|------|--------|
| CLI flag | — | none (and deliberately: no flag disables the scrub) |
| Slash command | — | none |
| Tool | `runCommand` | the child environment it hands to a command is scrubbed; signature, arguments, output format and gates unchanged |
| MCP | — | none (F4: `mcp.js` keeps its own allowlist) |

## 6. Files to Create/Modify

| Action | Path | Notes |
|------|--------|-------------|
| Create | `specs/2026-10-09-subprocess-env-scrub/spec.md` | this spec |
| Create | `specs/2026-10-09-subprocess-env-scrub/plan.md` | this plan |
| Create | `specs/2026-10-09-subprocess-env-scrub/tasks.md` | tasks + verification log |
| Create | `test/subprocess-env-scrub.test.js` | unit + integration + negative |
| Modify | `src/tools/security.js` | helper + pattern table + JSDoc |
| Modify | `src/tools/handlers/run-command.js` | one `exec` option + import |
| Modify | `CHANGELOG.md` | `[Unreleased] → Fixed` |
| Modify | `docs/code-quality-and-security.md` | § 2 threat-surface row + § 3 rule (command-execution layer) |
| Modify | `docs/deep-dive.md` | § 12 (new layer applied) + § 22.3 env row + § 21.1 P0-5 row |
| Modify | `features/built-in-tools.md` | Change History row (existing feature) |

## 7. Technical Decisions (summary)

1. **Helper lives in `security.js`, not `run-command.js`** (F5): the policy is a
   security contract, and a sibling handler (or a future one) can reuse it. The
   MCP module keeps its own mechanism, per F4.
2. **Snapshot copy, not in-place delete**: mutating `process.env` would be a
   severe regression (the emile process needs its keys — F2/RF-S06) and Node's
   `process.env` is a special object; a plain copy also makes the unit test pure.
3. **`PASSWD` added to the pattern group** (brief's regex already includes it):
   matches `MYSQL_PASSWORD`-style names too; no false-negative gap versus the
   brief.
4. **Loader vars matched with `/i`** even though `LD_PRELOAD`/`DYLD_*` are
   case-sensitive on Linux/macOS: on Windows the copy may arrive in any case, and
   fail-closed costs nothing (no legitimate tool *requires* these to be set for
   the child).
5. **`NODE_OPTIONS`/`PYTHONPATH`/`PERL5OPT`/`SSH_AUTH_SOCK` are kept** — grok's
   deny list does not include them either, and stripping them breaks real
   toolchains. Recorded in spec § 5/§ 7 and in the handoff (report, don't fix).
6. **`EMILE_*` fully dropped** including any future one: children of tool
   commands never need emile's own surface, and it removes an entire class of
   "child re-launches emile with the parent's model/provider/debug config".

## 8. Verification Strategy and Gates

| AC | Check |
|----|---------|
| AC-01 / AC-02 | Integration test: `process.env.OPENROUTER_API_KEY = '<sentinel>'` + `MYAPP_COLOR`, run `node -p JSON.stringify(process.env)` through `runCommand` with safe mode off (the `test/run-command.test.js` pattern), assert the sentinel and the name are absent and PATH/MYAPP_COLOR survive. Command and PATH lookup branch on `process.platform`. |
| AC-03 | Integration test: parent `EMILE_DEBUG_API=1` → absent in child; the tool result still reports `[working directory: …]` and the exit-code path works (probe regression guard). |
| AC-04 | Unit tests over a fixture: each RF-S03 class removed, mixed-case name removed, `PATH`/`MYAPP_COLOR` kept, input object unmutated. |
| AC-05 | Unit + integration for `LD_PRELOAD`, `LD_LIBRARY_PATH`, `DYLD_INSERT_LIBRARIES`. |
| AC-06 | Inspection: the helper takes only `baseEnv`; no `config` import, no `process.env` read, no toggle. Recorded in `tasks.md`. |
| AC-07 | `node --check` both touched files, `node --test test/subprocess-env-scrub.test.js`, `npm test` (exit 0), `npm run lint` (0 errors). |
| AC-08 | Existing `test/security.test.js` and the dry-run assertion in `test/run-command.test.js` pass untouched. |
| AC-09 | Docs diff review; Markdown table column counts revalidated (Rule 5). |

Commands (Rule 6.3): `node --check src/tools/security.js src/tools/handlers/run-command.js`;
`node --test test/subprocess-env-scrub.test.js`; `npm run lint`; `npm test`.
Smoke: the interactive `node bin/emile.js --verbose` needs a TTY and credentials;
the integration test drives the **real handler → real `exec` → real child
process**, which is the strongest available substitute on this host, plus
`node bin/emile.js --help` for the module graph. Recorded in `tasks.md`.

## 9. Git Workflow

| Item | Answer |
|------|--------|
| **Working branch** | `development` (confirmed via `git branch --show-current`); no switch, no branch, no worktree (Rule 8). |
| **Commit plan** | One coherent unit: helper + call site + tests + docs, staged with explicit paths. Foreign working-tree paths are never staged. |

## 10. Failures, Partial State and Rollback

| Topic | Strategy |
|------|------------|
| Error handling and user-facing messages | No new message. If a build genuinely needs a scrubbed variable, the command fails on its own terms — documented behavior, and the user runs it outside emile. |
| Interruption (Ctrl+C / Esc) and readline state | Not applicable — no terminal-mode or stdin change. |
| Partial state (session, undo stack, file cache) | Nothing persisted; the scrub is a per-call pure function. |
| Rollback / undo | Revert the single commit. No migration, no config change, no new file on disk. |

## 11. Technical Risks and Trade-offs

| Risk | Likelihood | Mitigation |
|-------|---------------|-----------|
| A legitimate workflow needs a `*PASSWORD*`/`LD_LIBRARY_PATH` var in the child. | Low, but real | Accepted deliberately (spec § 7): the alternative is credential disclosure. Reported as residual risk; no bypass added. |
| Pattern misses a secret named without any of the keywords (e.g. `AWS_ACCESS_ID`). | Medium | Out of scope: this is the *name*-shaped defense; tool-result redaction (P1-10) and the `~/.emile/config.json` storage path carry the rest. Reported. |
| `run-command.js` is the only `exec` that matters today; three handlers import `exec` unused (dead imports). | Certain (verified) | Not fixed here (Rule 6.2) — reported; it is a lint-warning-level cleanup, not a security hole, since they never spawn a child. |
