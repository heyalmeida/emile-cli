# Plan — Protect enhanced web-search credentials

| Field | Value |
|-------|-------|
| **Spec** | `2026-09-03-secure-enhanced-web-config` |
| **Status** | `implemented` |

## 1. Technical Approach

Expose a narrow protected-secret adapter from `src/config.js` for the existing credential store, then make `src/web/config.js` use it for `tavily` and `firecrawl`. Enhanced state and mode remain in `.emile/web.json`, but API-key fields are removed. Hydration migrates legacy key fields only after protected persistence succeeds. The command layer retains masked input and reports save failures without echoing values.

## 2. Architectural Compliance

- **ADR-0001:** Node built-ins, no dependency and no build step.
- **Architecture:** `config.js` owns protected secrets; `web/config.js` owns enhanced settings; no provider request/tool contract changes.
- **Security:** existing enhanced URL validation, bounded results, untrusted-content labeling and cost warnings remain unchanged.

## 3. Security and Threat Model

| Element | Handling |
|----------|----------|
| Secret storage | Reuse Windows DPAPI CurrentUser / non-Windows AES-GCM store from `config.js`. |
| Legacy migration | Save protected entry first; rewrite `.emile/web.json` without keys only after success. |
| Output | No key values in logs, errors, prompts, sessions or exports. |
| Failure | Fail closed; retain the only legacy copy if protected storage fails and show a bounded command error. |
| Web gates | No change to URL validation, provider timeouts, result bounds or untrusted external-content rules. |

## 4. Impacted Modules

| Module | Path | Change |
|--------|------|--------|
| Protected store | `src/config.js` | Export narrow generic protected-secret functions. |
| Enhanced settings | `src/web/config.js` | Hydrate/migrate/save Tavily and Firecrawl keys outside JSON. |
| Commands | `src/commands/handlers.js` | Surface save failure safely. |
| Tests | `test/web-config.test.js`, `test/secure-config.test.js` | Update secret-free persistence and migration coverage. |
| Documentation | README, security/product/architecture/changelog/features/specs | Document enhanced credential protection. |

## 5. Impacted Flags / Slash Commands / Tools

| Type | Name | Change |
|------|------|--------|
| CLI flag | None | No new flag. |
| Slash command | `/tavily`, `/firecrawl`, `/websearch` | Existing syntax; masked setup and enhanced mode remain. |
| Tool | `tavily_search`, `firecrawl_scrape` | No contract change. |

## 6. Files to Create/Modify

| Action | Path | Notes |
|--------|------|-------|
| Modify | `src/config.js` | Protected secret adapter. |
| Modify | `src/web/config.js` | Migration and secret-free JSON. |
| Modify | `src/commands/handlers.js` | Safe save failure UX. |
| Modify | `test/web-config.test.js` | New protected persistence assertions. |
| Modify | `test/secure-config.test.js` | Enhanced key migration coverage. |
| Create | `specs/2026-09-03-secure-enhanced-web-config/{spec,plan,tasks}.md` | SDD record. |
| Modify | `README.md`, `docs/product.md`, `docs/architecture.md`, `docs/code-quality-and-security.md`, `CHANGELOG.md`, feature registry | Documentation sync. |

## 7. Technical Decisions

- Keep enhanced provider state in `.emile/web.json` because it is workspace/runtime state; keep only credentials in the protected store.
- Use namespaced protected entries (`web:tavily`, `web:firecrawl`) so enhanced keys cannot collide with primary provider entries.
- Do not silently use a legacy key if protected migration fails; current session may remain usable only where explicitly already loaded, but persistence is reported as failed.

## 8. Verification Strategy and Gates

- `node --check src/config.js src/web/config.js src/commands/handlers.js test/web-config.test.js test/secure-config.test.js`.
- Run `node --test test/web-config.test.js test/secure-config.test.js test/commands.test.js`.
- Run `npm run lint` and full `npm test`; record Windows-only pre-existing failures.
- Run a real CLI restart E2E, inspect `.emile/web.json` and captured output for plaintext key absence, and verify `/websearch enhanced` state can still be enabled.

## 9. Git Workflow

| Item | Answer |
|------|--------|
| **Feature branch** | Keep current workflow; no branch operations. |
| **Commit plan** | Stage only explicit enhanced credential files after verification. |

## 10. Failures, Partial State and Rollback

| Topic | Strategy |
|-------|----------|
| Error handling | Bounded UI error; no secret value. |
| Interruption | Existing slash-command lifecycle remains unchanged. |
| Partial state | Never delete legacy keys before protected write succeeds. |
| Rollback | Revert the enhanced credential commit; legacy web.json remains untouched if migration fails. |

## 11. Technical Risks and Trade-offs

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Existing users expect web.json to contain keys. | Medium | Document migration and retain non-secret state/flags. |
| DPAPI unavailable. | Low/medium | Fail closed and preserve legacy key. |
| Enhanced mode is configured in one workspace but credentials are global. | Medium | Protected entries are per-user; settings mode remains workspace-specific as before. |
