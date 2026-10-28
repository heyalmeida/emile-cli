# Spec: Subprocess environment scrub — tool-executed commands never inherit provider credentials

| Field | Value |
|-------|-------|
| **ID** | `2026-10-09-subprocess-env-scrub` |
| **Status** | `implemented` |
| **Phase/Context** | Tools / execution security — deep-dive backlog wave 2, brief **P0-5** |
| **Related documents** | [Brief P0-5](../2026-10-08-deep-dive-backlog/briefs/p0-5-subprocess-env-scrub.md), [Shared constraints](../2026-10-08-deep-dive-backlog/_shared-constraints.md), [deep-dive § 12 / § 22.3](../../docs/deep-dive.md), [Code Quality and Security](../../docs/code-quality-and-security.md), [feature: built-in tools](../../features/built-in-tools.md) |

---

## 1. Problem / Motivation

`runCommand` is the one boundary in emile where **the model's text becomes a
process**. `src/tools/handlers/run-command.js:94` calls

```js
exec(shellCommand, { cwd: commandCwd, timeout }, (error, stdout, stderr) => …)
```

with **no `env` option**, so the child inherits the entire parent environment
(F1). Among those variables are the gateway credentials that `src/config.js:161-166`
(`ENV_KEY_MAP`) reads from `process.env`: `REQUESTY_API_KEY`, `OPENROUTER_API_KEY`,
`OPENCODE_API_KEY` — plus every other secret the developer happens to export in the
shell that launched emile (`AWS_SECRET_ACCESS_KEY`, `GH_TOKEN`, `GITLAB_PAT`,
database passwords…).

The attacker model is not hypothetical and does not require a malicious model:

- The model proposes `npm install <pkg>`; a **postinstall script** of any
  transitive dependency reads `process.env` and sends it to its telemetry
  endpoint. The script runs with full user rights, no confirmation beyond the
  one the user already gave for `npm install`.
- The model (or an injected file it read) proposes `curl … | sh`. Safe mode warns
  about exactly this shape — but after approval, the fetched payload still
  inherits the credentials.
- Prompt-injected content can simply ask to run `set`, `env` or `printenv`; the
  values then land in the tool result, which is written back into the model
  context and into the session JSON in `.emile/history/`.

grok-build neutralizes this class by scrubbing the child environment by default
(`grok: xai-grok-sandbox/src/command/policy.rs:138-156` — deny-by-name-pattern
`*KEY* *SECRET* *TOKEN* *PASSWORD* *CREDENTIAL* *_PAT`, `LD_PRELOAD`,
`LD_LIBRARY_PATH`, `DYLD_*`). emile has **no OS sandbox** (deep-dive § 22.3), so
this ~20-line change at the one boundary that matters is the cheap substitute:
the credential never reaches the child in the first place, so no command —
approved, injected or malicious — can read it.

## 2. Goal

A command executed through `runCommand` cannot read any provider credential,
secret-shaped variable, injection-prone loader variable or `EMILE_*` variable
present in the parent environment, while every unrelated variable a real build
needs (PATH, HOME/USERPROFILE, SYSTEMROOT, COMSPEC, TEMP, LANG, …) survives
unchanged.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-------------|---------------------|
| RF-S01 | `src/tools/security.js` exports `buildScrubbedEnv(baseEnv = process.env)` returning a shallow copy of the input with every matching name removed. | Must |
| RF-S02 | Matching is **case-insensitive on the name** (Windows environment names are case-insensitive — F3), so `Requesty_Api_KEY` is removed exactly like `REQUESTY_API_KEY`. | Must |
| RF-S03 | Removed name classes: `/KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL/`, `/(_|^)PAT$/`, `LD_PRELOAD`, `LD_LIBRARY_PATH`, `/^DYLD_/`, and everything starting with `EMILE_`. | Must |
| RF-S04 | Policy is **deny-by-pattern, not allow-by-list** (F6): every name not matching a pattern survives with its value untouched. | Must |
| RF-S05 | `runCommand` passes `env: buildScrubbedEnv(process.env)` to its single `exec` call, evaluated at execution time. | Must |
| RF-S06 | The **emile process keeps its own environment** (F2): the helper must never mutate the object it was given, and `src/config.js` key resolution is untouched. | Must |
| RF-S07 | No configuration option, CLI flag or environment variable can disable or narrow the scrub (shared constraints #1). | Must |
| RF-S08 | The existing execution gates are unchanged: `isSafeCommand`, the metacharacter rejection, safe-mode confirmation (including the network-pipe warning) and dry-run behave exactly as before. | Must |
| RF-S09 | The cwd probe keeps working: it sets `EMILE_COMMAND_STATUS` **inside** the child shell, so dropping the parent's `EMILE_*` cannot break exit-code or working-directory tracking. | Must |
| RF-S10 | The JSDoc records the policy: children of tool-executed commands must never see provider credentials; the model's own commands are untrusted input. | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|----------|
| **Risk classification** | **Medium** per [Code Quality and Security § 1](../../docs/code-quality-and-security.md) — credential exposure at the command-execution boundary; a contract change inside `src/tools/`. It is not High because it **adds** a control without touching the path/whitelist/dry-run gates themselves, and the emile-side credential resolution is unchanged. Residual severity if the control is wrong: leaked gateway API keys (billable + account takeover of a hosted provider). |
| **Assets/secrets** | `REQUESTY_API_KEY`, `OPENROUTER_API_KEY`, `OPENCODE_API_KEY` and any third-party secret exported in the launching shell. Values are never copied into the result, log or session: the scrub removes keys *before* the child starts. |
| **Command execution / file writes** | This change is **about** command execution: it only narrows what the already-gated child can read. `isSafeCommand`, `METACHARACTERS`, safe-mode confirmation, network-pipe warning and dry-run are byte-for-byte unchanged. No file write is added. |
| **Untrusted inputs** | The command string is untrusted model output. The scrub is defense-in-depth for the case where the command has already been approved: approval to *run* a command is not consent to *expose the environment*. |
| **Negative criteria** | Must NOT: mutate the input env object (breaking AC-04/F2); switch to an allowlist (breaks arbitrary builds — F6, RF-S04); delete `PATH`/`PATHEXT`/`SYSTEMROOT`/`COMSPEC`/`TEMP`/`TMP`/`HOME`/`USERPROFILE`/`LANG` (Windows `cmd.exe` and POSIX shells stop working, and builds stop resolving libraries); offer a toggle or `--no-scrub` path (RF-S07); scrub the emile process's own environment; change MCP child env (it already has its own allowlist, F4); print the removed names or their values anywhere. |

## 5. Out of Scope

Reported, not fixed (Rule 6.2):

- **MCP child env** — separate mechanism already in place (`mcp.js:29-43` allowlist + consent, F4). Its *server-supplied* `env` overrides from `mcp.json` are merged after the allowlist; reviewed, unchanged here.
- **Tool-RESULT secret redaction** — brief **P1-10** (`src/secrets.js` at the `agent.js` chokepoint). A command that prints *its own* secrets is not in scope.
- **The emile process's own environment** — untouched by design (F2); `config.js` keeps reading `process.env` normally.
- **`NODE_OPTIONS`, `PYTHONPATH`, `PERL5OPT`, `GEM_PATH`, `RUBYOPT`, `SSH_AUTH_SOCK`** — loader/tooling-shaped variables that grok does not deny either; removing them breaks real toolchains. Reported as a deliberate keep, not fixed (see § 7).
- **Egress proxy / OS-level sandbox** — disproportionate for a JS CLI (deep-dive § 22.6).

## 6. Acceptance Criteria

- **AC-01:** Given a secret-shaped var set in `process.env` (`OPENROUTER_API_KEY` with a sentinel value), when a command that dumps its own environment runs through `runCommand`, then the sentinel value and the variable name are absent from the tool result.
- **AC-02:** Given the same run, then `PATH` (case-insensitive) and an unrelated var (`MYAPP_COLOR`) are present in the child env — the scrub does not empty the environment.
- **AC-03:** Given `EMILE_*` set in the parent, when a command runs, then no `EMILE_*` name reaches the child, and the session-cwd/exit-code probe still reports correctly (RF-S09 regression).
- **AC-04:** `buildScrubbedEnv` removes every class of RF-S03 from a fixture, matches case-insensitively (`Requesty_Api_KEY`), and leaves the input object unmutated (the parent keeps all its keys).
- **AC-05:** Given `LD_PRELOAD`/`LD_LIBRARY_PATH`/`DYLD_INSERT_LIBRARIES` in the parent env, then none reaches the child.
- **AC-06:** No code path can disable the scrub: the helper reads no config, no flag and no env var (verifiable by inspection + the absence of any `config`/`process.env` read inside it).
- **AC-07:** Regression: `test/run-command.test.js`, `test/security.test.js` and the whole suite pass unchanged (`npm test` exits 0); `npm run lint` reports 0 errors; the new suite passes on Windows and is written to pass on POSIX.
- **AC-08:** Dry-run and safe-mode behavior are unchanged (`npm test`'s existing dry-run assertion + `test/security.test.js` green; no new user-facing text).
- **AC-09:** Rule 2 docs sync applied: CHANGELOG `[Unreleased] → Fixed`; `docs/code-quality-and-security.md` command-execution control; `docs/deep-dive.md` § 12 layer + § 22.3 row; `features/built-in-tools.md` Change History row (Rule 7.4).

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|--------|-------------------|
| Deny-by-pattern also removes a var a legitimate build genuinely needs (e.g. `MYSQL_PASSWORD` consumed by an integration test the agent runs, or `LD_LIBRARY_PATH` for a non-standard shared library). | A command fails with a confusing "missing credential" error. | Accepted deliberately: those are secrets, and grok applies the same rule (F6). The escape hatch is not a toggle — the user runs the command outside emile, or passes the value explicitly inside the command they approve. Recorded as residual risk in `tasks.md` and in the handoff. |
| Deleting `EMILE_*` could break a subprocess that relaunches emile. | Only affects `EMILE_*` **config** vars read at emile startup; nothing in the codebase reads them inside a tool child (verified by grep: the 15 `EMILE_*` reads all live in `src/` and target the emile process). | Accepted; the cwd probe is the only `EMILE_*` name in the child path and it *sets* it itself (AC-03). |
| Child env is now a snapshot taken at exec time. | None: it is computed per call, so a value exported mid-session by an earlier command still cannot leak to a later one. | Implementation detail verified by the integration test. |
| Case-insensitive name matching against a plain-object copy. | If Windows delivered two keys differing only by case, both are removed — fail-closed, never fail-open. | Test asserts both the mixed-case and the canonical spelling. |
| `NODE_OPTIONS` survives (it can smuggle `--require`). | A malicious command could affect *its own* further children only; the parent's `NODE_OPTIONS` was already in the environment. | Deliberately kept: stripping it breaks legitimate toolchains (coverage reporters, ts-node loaders). Reported, not fixed (§ 5). |

## 8. References

- `src/tools/security.js` (new helper), `src/tools/handlers/run-command.js` (single `exec` call site).
- `src/config.js:161-166` (`ENV_KEY_MAP`) — the credential source, unchanged.
- `src/mcp.js:29-43` — existing sibling control (spirit, not mechanism — F4).
- `test/run-command.test.js` — the safe-mode-off execution pattern reused by the new test.
- grok-build `crates/codegen/xai-grok-sandbox/src/command/policy.rs:138-156` (F6).
- `docs/deep-dive.md` § 12 (turn security layers), § 22.3 (env-of-subprocess row), § 22.1 lesson 3.
