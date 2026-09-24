# Plan — Persistent user configuration with protected provider credentials

| Field | Value |
|-------|-------|
| **Spec** | `2026-09-03-secure-global-config` |
| **Status** | `implemented` |

## 1. Technical Approach

Move persisted user settings to an OS-appropriate per-user directory. Keep `.emile/` for workspace/runtime state. Store provider credentials in a separate credentials file: DPAPI CurrentUser ciphertext on Windows, AES-256-GCM ciphertext plus an owner-only local key on other platforms. Load and migrate legacy workspace config only when protected storage succeeds. `config.apiKey` remains the in-memory compatibility contract, while `resolveApiKey()` reads protected storage or the matching environment variable and never reads a plaintext key from settings JSON.

The implementation uses Node built-ins (`node:crypto`, `node:child_process`, `node:os`) and no new dependency. PowerShell is invoked only for Windows DPAPI with a static script and secret input through stdin; the key is never placed in arguments, logs or errors.

## 2. Architectural Compliance

- **ADR-0001:** plain ES modules, no build step, no new dependency and raw Node APIs.
- **Architecture:** `config.js` remains the single configuration/credential boundary; `commands.js` only orchestrates the wizard and uses the save API.
- **Security:** provider-specific resolution and fail-closed migration follow `docs/code-quality-and-security.md`; no tool or safe-mode path changes.

## 3. Security and Threat Model

| Element | Handling |
|----------|----------|
| Command execution and whitelist | No model tool execution changes. DPAPI uses a fixed PowerShell command and stdin; no user-controlled shell fragment is interpolated. |
| File writes and `resolveSafePath` | User config writes are explicit startup/settings operations outside the model tool boundary. Paths are derived from OS config variables, not model input. Directory/key files use owner-only modes where supported. |
| LLM inputs (prompt injection / tool args) | No model input is added. Legacy JSON and env values are treated as configuration data and never executed. |
| Secrets (API keys, sessions, exports) | Settings JSON has no key property. Credential values are DPAPI/AES ciphertext; errors/logs are bounded and never include secret values. Sessions/exports remain unchanged. |
| Controls and negative tests | Test no key in settings, legacy migration, wrong-provider isolation, corrupt store, fallback decryption and migration failure without deleting the legacy key. |

## 4. Impacted Modules

| Module | Path | Change |
|--------|------|--------|
| Configuration | `src/config.js` | Global user paths, protected credential store, migration, key resolution and secret-free save. |
| Wizard | `src/commands.js` | Secret-free save confirmation and secure-settings copy. |
| Tests | `test/config-permissions.test.js` and new focused tests | Credential persistence, migration, wrong-provider and corruption coverage. |
| Documentation | `docs/product.md`, `docs/architecture.md`, `docs/code-quality-and-security.md`, `README.md` | Document global config and storage limitations. |

## 5. Impacted Flags / Slash Commands / Tools

| Type | Name | Change |
|------|------|--------|
| CLI flag | None | No new flag. |
| Slash command | `/connect` | Existing command uses the new secure save path; no syntax change. |
| Tool | None | No tool contract change. |
| Environment | `EMILE_CONFIG_DIR` | Optional test/portable override for the per-user config directory; not a credential input. |

## 6. Files to Create/Modify

| Action | Path (expected) | Notes |
|--------|-----------------|-------|
| Modify | `src/config.js` | Main implementation. |
| Modify | `src/commands.js` | User-facing save copy. |
| Create | `test/secure-config.test.js` | Isolated subprocess coverage for global persistence and migration. |
| Create | `specs/2026-09-03-secure-global-config/{spec,plan,tasks}.md` | SDD record. |
| Modify | `README.md` | Global config and credential storage documentation. |
| Modify | `docs/architecture.md` | New config paths and credential boundary. |
| Modify | `docs/code-quality-and-security.md` | DPAPI/fallback threat model. |
| Modify | `docs/product.md` | Persistent configuration/security requirement. |
| Modify | `CHANGELOG.md` | Unreleased change entry. |
| Modify | `features/model-system.md` or new config feature | Registry traceability. |

## 7. Technical Decisions (summary)

- Use OS user configuration instead of workspace configuration so setup survives changing workspaces.
- Keep the in-memory `config.apiKey` property for API-client compatibility; never serialize it.
- Use DPAPI on Windows because the target environment is Windows and it provides user-bound protection without a native dependency.
- Use authenticated AES-GCM fallback elsewhere, with a separate key file and explicit same-user limitation.
- Migrate old plaintext credentials only after protected storage succeeds; never destroy the only usable copy on failure.

## 8. Verification Strategy and Gates

- `node --check src/config.js src/commands.js test/secure-config.test.js`.
- Run `node --test test/secure-config.test.js test/config-permissions.test.js test/commands.test.js`.
- Run a real CLI E2E: first-run configuration in an isolated config directory, restart with the same directory, and verify no connect prompt and no secret in settings JSON/stdout.
- Run `npm run lint`; run full `npm test` and record pre-existing Windows failures separately.
- Verify no key values appear in test output, captured CLI output, errors or settings files.

## 9. Git Workflow

| Item | Answer |
|------|--------|
| **Feature branch** | Keep the current branch; do not perform branch operations automatically. |
| **Commit plan** | Commit only the explicit config/spec/test/docs paths after verification. |
| **Prior commit** | Previous streaming change was validated with a real provider E2E and committed as `b5e6c37` before this work began. |

## 10. Failures, Partial State and Rollback

| Topic | Strategy |
|-------|----------|
| Error handling and user-facing messages | Secret-store failures are bounded warnings; startup remains fail-closed and the wizard can retry. |
| Interruption | No interactive prompt is added to the credential store; existing wizard cancellation remains unchanged. |
| Partial state | Config and credentials are written separately; a failed migration leaves the legacy file untouched. |
| Rollback | The new global files can be removed independently; workspace runtime state is not touched. Existing provider env vars remain supported. |

## 11. Technical Risks and Trade-offs

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| PowerShell invocation is unavailable in a restricted Windows environment. | Medium | Fail closed, keep legacy key, show actionable warning and permit retry. |
| Non-Windows fallback is accessible to the same OS user. | Medium | Separate key/ciphertext, AES-GCM, 0600 modes and explicit documentation. |
| Existing config precedence changes. | Medium | Migrate legacy workspace settings, document global precedence and test fresh-process reload. |
