# Spec: Persistent user configuration with protected provider credentials

| Field | Value |
|-------|-------|
| **ID** | `2026-09-03-secure-global-config` |
| **Status** | `implemented` |
| **Phase/Context** | Configuration / credential security |
| **Related documents** | [PRD](../../docs/product.md), [architecture](../../docs/architecture.md), [Code Quality and Security](../../docs/code-quality-and-security.md), [ADR-0001](../../docs/adr/0001-tech-stack-choice.md) |

## 1. Problem / Motivation

The CLI currently stores the complete setup, including the provider API key, in `.emile/config.json` under the current workspace. This makes configuration disappear when the CLI is launched from another workspace, forces repeated setup, and leaves credentials in a readable JSON file. The first-run wizard should configure the CLI once, while the workspace `.emile/` directory remains for local runtime state such as sessions, undo history and MCP consent.

The provider key must be persisted without being present in the user configuration JSON. On Windows, the native DPAPI CurrentUser scope provides OS-user-bound protection. On other platforms, the fallback is an AES-256-GCM encrypted credential file with a separate owner-only key file and an explicit limitation in documentation.

## 2. Goal

Persist provider, model, effort, web-search and loop-cap settings in a per-user configuration location, persist provider credentials separately using OS protection where available, migrate legacy workspace credentials safely, and keep environment-variable configuration working without changing provider behavior.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-----------|--------------------|
| RF-S01 | User settings and credentials MUST be loaded on every CLI startup without requiring the connect wizard when a valid saved credential exists. | Must |
| RF-S02 | The persisted user settings MUST be stored outside the workspace configuration file in an OS-appropriate per-user config directory. | Must |
| RF-S03 | The user settings JSON MUST never contain `apiKey` or another credential value. | Must |
| RF-S04 | Provider credentials MUST be stored separately and protected using Windows DPAPI CurrentUser when running on Windows. | Must |
| RF-S05 | Non-Windows systems MUST use an AES-256-GCM encrypted credential file with a separate owner-only key, with the limitation documented. | Must |
| RF-S06 | Existing `.emile/config.json` credentials MUST be migrated to protected storage on first load when possible, and the plaintext key MUST be removed from the legacy JSON after successful migration. | Must |
| RF-S07 | `/connect` MUST save provider/model settings and credentials without printing or logging the secret. | Must |
| RF-S08 | `resolveApiKey(provider)` MUST use only the matching protected credential or matching provider-specific environment variable; no cross-provider fallback is allowed. | Must |
| RF-S09 | Missing/corrupt credential storage MUST fail closed with a bounded warning and the connect wizard, never silently fall back to another provider's key. | Must |
| RF-S10 | Existing session, undo, MCP and enhanced-web workspace state under `.emile/` MUST remain unchanged. | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|----------|
| **Risk classification** | High — credential persistence, secret migration and startup authentication boundaries are security-sensitive. |
| **Assets/secrets** | Provider API keys, enhanced-web credentials and user settings. Enhanced-web credential storage is out of scope for this change; provider keys are the focus. |
| **Command execution / file writes** | No model tool command execution changes. CLI startup writes only the per-user config/credential files and may rewrite the legacy workspace config after successful migration. |
| **Untrusted inputs** | Legacy JSON and environment values are untrusted input; they are parsed defensively, bounded where displayed, and never passed to a shell. PowerShell receives secrets only through stdin with a static script. |
| **Negative criteria** | Never write a key to JSON, command-line arguments, logs, errors, session exports or prompts; never delete a legacy key before protected storage succeeds; never use another provider's key; never weaken safe mode or tool gates. |

## 5. Out of Scope

- Adding a native dependency or changing the project stack.
- Supporting Windows Credential Manager through a new package.
- Encrypting enhanced-web keys stored by the separate web configuration module.
- Migrating session files, MCP configuration, model catalogs or tool settings.
- Changing provider API request behavior.

## 6. Acceptance Criteria

- **AC-01:** Given a temporary per-user config directory with a protected credential, when `config.js` loads in a fresh process, then provider/model settings and the matching API key are available without the connect wizard.
- **AC-02:** Given `saveUserConfig({ provider, apiKey, model })`, when the settings JSON is inspected, then no `apiKey` property or key value exists and the protected credential entry exists.
- **AC-03:** Given a legacy `.emile/config.json` with a key, when migration succeeds, then the key is available through protected storage and the legacy JSON no longer contains the key property.
- **AC-04:** Given a non-Windows fallback, when a credential is stored and loaded in a fresh process, then decryption returns the original value and files are owner-only where the platform supports modes.
- **AC-05:** Given a missing or corrupt credential store, when credentials are resolved, then the result is empty for that provider, a bounded warning is emitted, and no other provider key is used.
- **AC-06:** Given provider A credentials and a switch to provider B without a key, when resolving B, then B has no credential and the wizard is allowed to request one.
- **AC-07:** Existing focused tests, syntax checks, lint and a real CLI startup/configuration E2E remain green; full-suite environment limitations are recorded.
- **AC-08:** No secret appears in captured CLI output, error output, persisted settings JSON or the new tests' assertion output.

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|--------|-----------------|
| Windows PowerShell may be unavailable or restricted. | High | Fail closed, keep the legacy file untouched, show a bounded warning and allow the wizard to retry; DPAPI is used only through a static stdin-fed command. |
| Non-Windows encrypted fallback can be read by the same OS user who can read both files. | Medium | Keep key and ciphertext separate, use AES-256-GCM and owner-only modes, and document that this is not equivalent to an OS keychain. |
| Existing users have a workspace-only configuration. | Medium | Read it as a legacy fallback, migrate protected credentials and rewrite sanitized settings to the per-user location. |
| Multiple provider keys are needed after switching providers. | Medium | Store one protected entry per provider and resolve only the active provider's entry. |

## 8. References

- `src/config.js` — current workspace config load/save and key resolution.
- `src/commands.js` — connect wizard and user-facing save message.
- `test/config-permissions.test.js` — existing credential and file-permission coverage.
- `docs/code-quality-and-security.md` — credential threat surface and fail-closed rules.
- `docs/architecture.md` — configuration module responsibility.
