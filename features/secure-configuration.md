# Feature: Secure persistent configuration

| Field | Value |
|-------|-------|
| **Status** | `active` |
| **Delivery date** | 2026-09-03 |
| **Source spec** | `specs/2026-09-03-secure-global-config` + `specs/2026-09-03-secure-enhanced-web-config` |
| **PRD RFs served** | RF-02, RF-22 |
| **Owner/Area** | Configuration / Security |

## Description

Emile stores provider and model preferences in the current operating-system user's configuration directory, so the setup survives launches from different workspaces. Provider API keys are kept in a separate protected credential store and never serialized into the ordinary settings JSON.

On Windows, credentials use DPAPI scoped to the current user. On other platforms, the fallback uses authenticated AES-256-GCM encryption with a separate owner-only key file; this protects the settings surface but does not replace an OS keychain.

## How It Works

1. Startup loads the per-user settings and protected credential store.
2. A legacy `.emile/config.json` credential is migrated only after protected storage succeeds, then removed from the legacy JSON.
3. `/connect` saves provider settings separately from the protected credential and reports only a generic success message.
4. `resolveApiKey()` reads only the selected provider's protected entry or matching environment variable.
5. Workspace `.emile/` continues to hold sessions, undo state, MCP consent and enhanced web-search flags; enhanced web credentials are protected in the per-user credential store.

## Technical Details

| Item | Detail |
|------|--------|
| **CLI flags** | None; `EMILE_CONFIG_DIR` provides an isolated per-user config override |
| **Slash commands** | `/connect` uses protected persistence |
| **Tools** | No model tool contract changes |
| **Configuration** | OS user settings JSON plus protected credentials; provider env vars remain supported |
| **Applicable security gates** | No cross-provider key fallback; legacy key is removed only after successful protected migration; no secret in output |

## Where It Lives in the Code

| Layer | Main paths |
|--------|------------|
| Configuration and credential boundary | `src/config.js` |
| Enhanced web settings | `src/web/config.js` |
| Connect/model wizards | `src/commands.js` |
| Isolated coverage | `test/secure-config.test.js`, `test/config-permissions.test.js` |

## Known Limitations

The non-Windows fallback is accessible to the same OS user who can read both the encrypted credential file and its key file; it is not equivalent to a hardware-backed or OS-keychain credential. Enhanced-web provider state remains workspace-specific, while Tavily and Firecrawl credentials use the same protected per-user store.

## Change History

| Date | Change | Reference |
|------|---------|------------|
| 2026-09-03 | Added global settings persistence, protected provider credentials and safe legacy migration | `specs/2026-09-03-secure-global-config` / CHANGELOG |
| 2026-09-03 | Moved Tavily/Firecrawl credentials to protected storage while preserving enhanced mode and flags | `specs/2026-09-03-secure-enhanced-web-config` / CHANGELOG |
