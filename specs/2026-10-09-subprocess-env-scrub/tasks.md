# Tasks: Subprocess environment scrub — tool-executed commands never inherit provider credentials

| Field | Value |
|-------|-------|
| **Spec** | `2026-10-09-subprocess-env-scrub` |

---

## Phase 0 — Preparation

- [x] T0.1 — Read relevant documentation — *Rule 1* — `.clinerules`, brief P0-5 + `_shared-constraints.md`, `docs/deep-dive.md` § 3/§ 12/§ 20/§ 21.1/§ 22.1/§ 22.3, `docs/code-quality-and-security.md` § 1–6, `docs/architecture.md` (tools row), `features/built-in-tools.md`, `specs/README.md`, `specs/_templates/*`, ADR-0001/0002; full reads of `src/tools/security.js`, `src/tools/handlers/run-command.js`, `src/config.js` (`ENV_KEY_MAP` :161-166, `resolveApiKey` :176-186), `src/mcp.js:29-43` (sibling control), `test/run-command.test.js`, `test/security.test.js`, `README.md` tools table
- [x] T0.2 — Confirm spec/plan `approved` before code — both headers were `approved` when implementation began (Rule 3 order spec → plan → tasks → code); flipped to `implemented` at close
- [x] T0.3 — Classify risk + threat surfaces + gates — **Medium** (credential exposure at the execution boundary; adds a control without touching existing gates; not High because path/whitelist/dry-run gates are untouched). Threat model = the F1 scenario (approved command inherits `OPENROUTER_API_KEY`). Negative criteria in spec § 4; gates in plan § 8 and below
- [x] T0.4 — Branch check — `git branch --show-current` → `development`; `git status --porcelain` clean at start (prior brief committed); no branch/worktree operations
- [x] T0.5 — Boundary survey (extra): `grep` proved `exec()` at `run-command.js:94` is the **only** subprocess spawn in `src/` (no `execSync`/`spawnSync`/`execFile`/`spawn` anywhere), and four handlers (`find-files`, `grep-search`, `list-dir`, `read-file`) import `exec` but never call it — so the single call site covers 100% of tool-executed children. Dead imports reported, not removed (Rule 6.2)

## Phase 1 — Implementation

- [x] T1.1 — `src/tools/security.js:41-77`: `SCRUBBED_ENV_PATTERNS` + exported `buildScrubbedEnv(baseEnv = process.env)` — shallow copy, case-insensitive delete of `/KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL/`, `/(_|^)PAT$/`, `^LD_PRELOAD$`, `^LD_LIBRARY_PATH$`, `^DYLD_`, `^EMILE_`; input never mutated; no `config` import, no env read *(verifies RF-S01..RF-S04, RF-S06, RF-S07, AC-04, AC-06)*
- [x] T1.2 — JSDoc + block comment state the policy ("children of tool-executed commands must NEVER see provider credentials… the model's own commands are untrusted input"), the deny-not-allowlist rationale, the case-insensitivity reason and the explicit no-bypass statement *(verifies RF-S10)*
- [x] T1.3 — `src/tools/handlers/run-command.js:100`: `exec(shellCommand, { cwd, timeout, env: buildScrubbedEnv(process.env) }, …)` with an intent comment; import extended at `:8` *(verifies RF-S05, AC-01)*
- [x] T1.4 — Nothing else moved: `isSafeCommand` (:82-89), `METACHARACTERS` (:21), safe-mode confirmation + network-pipe warning, dry-run, cwd probe, 50k truncation are byte-for-byte unchanged; `security.js` exports are additive only *(verifies RF-S08, RF-S09, AC-08)* — evidence: `git diff` on the handler is 2 hunks (import + `exec` options); `git diff` on security.js is one inserted block

## Phase 2 — Testing, Security and Verification

- [x] T2.1 — Unit matrix `test/subprocess-env-scrub.test.js`: all classes deleted; mixed-case `Requesty_Api_KEY` deleted (F3); `PATH`+`MYAPP_COLOR` kept (exact key-set assertion); second test keeps a 23-name real-build list (`PATHEXT`, `SystemRoot`-class, `JAVA_HOME`, `NODE_ENV`, `CI`, …); third proves the source object is unmutated *(verifies AC-04, AC-02 negative side, RF-S02/S04/S06)*
- [x] T2.2 — Integration: sentinel `OPENROUTER_API_KEY` + `REQUESTY_API_KEY` + `EMILE_TEST_SCRUB_DEBUG` + `LD_PRELOAD` + `DYLD_INSERT_LIBRARIES` + `MYAPP_COLOR` in `process.env`; **real** `runCommand` → real `exec` → real `node` child dumping `JSON.stringify(process.env)`; asserts no sentinel value and none of those names reach the child, and that PATH + the unrelated var do *(verifies AC-01, AC-02, AC-05)*
- [x] T2.3 — **Mutation check (the honest gate)**: the `env:` option was temporarily reverted and the integration test re-run — it failed with `AssertionError: the credential VALUE must not reach the child`, then the fix was restored from backup and the suite went green again. Evidence that the test actually detects the hole *(verifies AC-01)*
- [x] T2.4 — Parent-side test: after an execution, `process.env.OPENROUTER_API_KEY` still equals the sentinel in the emile process (F2 — only the child is scrubbed) *(verifies RF-S06)*
- [x] T2.5 — Probe regression: `mkdir && cd` then `exit 7` through the real handler — `[working directory: scrubsite]` and `Command failed with code 7` still reported with `EMILE_*` scrubbed from the parent *(verifies AC-03, RF-S09)*
- [x] T2.6 — `node --check src/tools/security.js src/tools/handlers/run-command.js test/subprocess-env-scrub.test.js` → all clean (`SYNTAX_OK`)
- [x] T2.7 — `node --test test/subprocess-env-scrub.test.js` → **7 tests / 7 pass / 0 fail / 0 skipped**
- [x] T2.8 — `npm run lint` → **0 errors, 144 warnings** (identical to the pre-change baseline — no new warning); `npm test` → **370 tests / 360 pass / 0 fail / 0 cancelled / 10 skipped / exit 0** (363 baseline + the 7 new tests)
- [x] T2.9 — `npm audit` → **not applicable**: no dependency added, `package.json` and `package-lock.json` untouched (`git status` clean for both); no config toggle introduced (AC-06)
- [x] T2.10 — Smoke: `node bin/emile.js --help` (module graph + tools barrel load). The interactive `--verbose` smoke needs a TTY and live credentials; the integration test exercises the real handler → real child process, which is the strongest substitute available on this host. Recorded as a limitation in T3.7
- [x] T2.11 — Every AC verified; log below
- [x] T2.12 — **Host + toolchain audit** (false-positive surface): live `process.env` here has 43 names and the scrub removes **0**, with `Path`/`SystemRoot`/`ComSpec`/`TEMP`/`TMP`/`USERPROFILE` all surviving despite mixed case (case-insensitive match does not over-delete). Survey over ~70 realistic toolchain names: deletions are limited to `LD_LIBRARY_PATH`, `DYLD_LIBRARY_PATH`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `GOOGLE_APPLICATION_CREDENTIALS`, `NPM_TOKEN`, `GH_TOKEN`/`GITHUB_TOKEN`, `GITLAB_PAT`, all provider keys and all `EMILE_*`. `NODE_OPTIONS`, `PYTHONPATH`, `PERL5OPT`, `RUBYOPT`, `GEM_PATH`, `SSH_AUTH_SOCK`, `KUBECONFIG`, `DOCKER_HOST`, `JAVA_HOME`, `GOPATH`, `CARGO_HOME`, `NPM_CONFIG_*` survive → no shell/runtime/npm breakage class was found

## Phase 3 — Documentation and Closing

- [x] T3.1 — Rule 2: `CHANGELOG.md` `[Unreleased] → Fixed` entry; `docs/code-quality-and-security.md` § 2 **Shell execution** row (threat + control now name the child-env scrub) and a new § 3 rule 10 ("Approval to run is not disclosure of the environment"), rule 10→11 renumber for the memory rule
- [x] T3.2 — `docs/deep-dive.md`: § 12 mermaid gains layer 5 (renumbered to 8 layers), prose paragraph documenting the applied fix, § 22.3 env row marked ✅ aplicado, § 21.1 P0-5 backlog row marked ✅ aplicado, briefs pack status row
- [x] T3.3 — Rule 7.4: `features/built-in-tools.md` — Change History row + "Applicable security gates" row; `README.md` `runCommand` tool row (user-facing behavior, Rule 2 cross-consistency); `docs/architecture.md` tools-domain module row
- [x] T3.4 — Rule 5 revalidation: § 12 Mermaid block — 8 nodes `L1..L8`, all labels quoted `["…"]`, `<br/>` for line breaks, chain verified `L1->L2 … L7->L8, L8(end)`; all edited Markdown table rows re-counted against their headers (unescaped-pipe counting so `curl \| sh` does not mis-count): cqs threat row 4=4, § 22.3 row 5=5, § 21.1 row 7=7, pack status row 3=3, features rows 3=3 and 4=4, README tool row 3=3
- [x] T3.5 — Spec and plan status → `implemented`
- [x] T3.6 — Commit on `development` staging only explicit paths (Rule 8); hash recorded below
- [x] T3.7 — Limitations recorded below

---

## Acceptance Criteria Verification Log

| AC | Status | Evidence (how it was verified) |
|----|--------|--------------------------------|
| AC-01 | ✅ | Integration test: sentinel value `SENTINEL-OPENROUTER-KEY-MUST-NOT-LEAK` absent from a real child's env dump; mutation check (T2.3) proves the test fails without the fix |
| AC-02 | ✅ | Same test asserts `PATH` matches and `"scrub-probe-survivor"` is present; separate unit test keeps a 23-name real-build list intact; host audit shows 0 of 43 live names deleted |
| AC-03 | ✅ | `EMILE_TEST_SCRUB_DEBUG` absent in the child while `mkdir/cd` + `exit 7` still report cwd and exit code correctly (probe sets `EMILE_COMMAND_STATUS` inside the child shell) |
| AC-04 | ✅ | Unit test deletes `Requesty_Api_KEY` (mixed case) alongside the canonical names and asserts `Object.keys` equals `['PATH','MYAPP_COLOR']`; non-mutation test asserts the source object still holds the sentinel |
| AC-05 | ✅ | Unit (`LD_PRELOAD`, `DYLD_INSERT_LIBRARIES` in fixture) + integration (`"LD_PRELOAD"`/`"DYLD_INSERT_LIBRARIES"` absent in the child dump); `LD_LIBRARY_PATH` covered in the audit survey |
| AC-06 | ✅ | `buildScrubbedEnv` signature is `(baseEnv = process.env)`; no `config` reference, no `process.env` read, no `EMILE_*` opt-out anywhere in the added code; `assert.equal(buildScrubbedEnv.length, 0)` in the suite |
| AC-07 | ✅ | `node --check` clean ×3; new suite 7/7; `npm test` 370/360 pass/0 fail/exit 0; `npm run lint` 0 errors/144 warnings; `test/run-command.test.js` and `test/security.test.js` pass unchanged |
| AC-08 | ✅ | Dry-run assertion in `test/run-command.test.js` and the whole `test/security.test.js` describe-block green with no edit to either file; no new user-facing text in the handler diff |
| AC-09 | ✅ | CHANGELOG + code-quality-and-security (§ 2 row, § 3 rule) + deep-dive (§ 12 layer+prose, § 22.3, § 21.1, line-ref corrections) + `features/built-in-tools.md` (2 rows) + README tool row + architecture module row — all diff-reviewed, table/Mermaid validity re-checked in T3.4 |

## Verification Log (commands and results)

| Command | Result |
|---------|--------|
| `git branch --show-current` / `git status --porcelain` | `development` / clean at start |
| `npm test` (pre-change baseline) | 363 tests / 353 pass / 0 fail / 10 skipped — the brief's "324" figure is stale, consistent with the P0-4 finding |
| `npm run lint` (pre-change baseline) | 0 errors / 144 warnings |
| `node --check src/tools/security.js src/tools/handlers/run-command.js test/subprocess-env-scrub.test.js` | exit 0 |
| `node --test test/subprocess-env-scrub.test.js` | **7 / 7 pass / 0 fail** |
| mutation test (`env:` option reverted) | integration test **failed** with "the credential VALUE must not reach the child" → restored → 7/7 pass |
| `npm run lint` (post-change) | **144 problems (0 errors, 144 warnings)** — unchanged from baseline |
| `npm test` (post-change) | **370 / 360 pass / 0 fail / 0 cancelled / 10 skipped / exit 0** |
| host env audit (43 live names) | **0 removed**; `Path`, `SystemRoot`, `ComSpec`, `TEMP`, `TMP`, `USERPROFILE` survive |
| toolchain survey (~70 names) | deletions confined to credentials, `*_PAT`, `LD_*`/`DYLD_*` loaders and `EMILE_*` |
| `node bin/emile.js --help` | exit 0 |
| `wsl` POSIX re-run of the new suite | not possible — "Windows Subsystem for Linux is not installed"; POSIX branch is code-reviewed only |

## Limitations / Residual Risk

- **POSIX path not executed.** The integration test branches on `process.platform` (`mkdir -p` / `sh -c "exit 7"`, `PATH` lookup) and shares the identical scrub logic, but only the Windows branch was run here (no WSL distro on this host).
- **A legitimate build may need a deleted variable** — concretely `LD_LIBRARY_PATH`/`DYLD_LIBRARY_PATH` (non-standard shared libs) or an env-based cloud credential (`AWS_ACCESS_KEY_ID`, `GOOGLE_APPLICATION_CREDENTIALS`, `NPM_TOKEN`). Deliberate: the alternative is disclosure. No bypass was added; the escape hatch is running that command outside emile or passing the value explicitly inside a command the user approves. Documented in spec § 5/§ 7 and plan § 11.
- **Name-shaped defense only.** A secret whose name matches none of the patterns (e.g. `AWS_ACCESS_ID`, `SF_DC_TOKEN` variants aside) still propagates; that gap belongs to brief **P1-10** (tool-result redaction) and is out of scope here.
- **`NODE_OPTIONS`, `PYTHONPATH`, `PERL5OPT`, `RUBYOPT`, `GEM_PATH`, `SSH_AUTH_SOCK` survive** — kept deliberately (grok does not deny them; stripping them breaks real toolchains). Reported, not fixed.
- **Dead `exec` imports** in `find-files.js`, `grep-search.js`, `list-dir.js`, `read-file.js` (4 pre-existing lint warnings, no call sites) — reported, not removed.

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| ⏳ (recorded after commit) | `fix(tools): scrub secrets and injection-prone vars from subprocess env` | `src/tools/security.js`, `src/tools/handlers/run-command.js`, `test/subprocess-env-scrub.test.js`, `specs/2026-10-09-subprocess-env-scrub/*`, `CHANGELOG.md`, `README.md`, `docs/architecture.md`, `docs/code-quality-and-security.md`, `docs/deep-dive.md`, `features/built-in-tools.md`, `specs/2026-10-08-deep-dive-backlog/README.md` |
