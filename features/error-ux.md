# Feature: Error UX

| Field | Value |
|-------|-------|
| **Status** | `active` |
| **Delivery date** | 2026-08-30 |
| **Source spec** | `specs/2026-08-30-error-ux` + `specs/2026-08-31-web-search-tool-reliability` |
| **PRD RFs served** | RF-01, RF-05 |
| **Owner/Area** | API / Tools / UI |

## Description

Common provider failures are translated into concise next steps, including
quota/billing, permission and server errors, while the original error remains
available internally for retry, context-overflow recovery and model fallback.
Safe-mode command confirmation adds friction when network content is piped into
a shell interpreter, a common prompt-injection pattern.

## Technical Details

| Item | Detail |
|------|---------|
| **Tools** | `runCommand` |
| **Configuration** | Existing safe mode and retry policy; `/websearch` is OpenRouter-only and opt-in |
| **Applicable security gates** | Safe-mode confirmation, dry-run and existing whitelist remain unchanged |

## Where It Lives in the Code

| Layer | Main paths |
|-------|------------|
| API | `src/api/client.js`, `src/agent/agent.js` |
| Command warning | `src/tools/handlers/run-command.js` |

## Known Limitations

Only common statuses and timeout conditions have dedicated messages. Provider-
specific details are bounded and redacted before terminal output; raw error
bodies are never copied wholesale.

## Change History

| Date | Change | Reference |
|------|--------|-----------|
| 2026-08-30 | Added actionable API failures and network-to-shell confirmation warning | Source spec / CHANGELOG |
| 2026-08-31 | Classified provider quota/permission/server failures with bounded secret-redacted details and normalized nested OpenRouter SSE status codes | `specs/2026-08-31-web-search-tool-reliability` / CHANGELOG |
