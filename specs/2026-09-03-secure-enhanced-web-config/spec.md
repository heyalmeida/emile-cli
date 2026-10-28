# Spec: Protect enhanced web-search credentials

| Field | Value |
|-------|-------|
| **ID** | `2026-09-03-secure-enhanced-web-config` |
| **Status** | `implemented` |
| **Phase/Context** | Configuration / enhanced web search security |
| **Related documents** | [secure configuration](../2026-09-03-secure-global-config/spec.md), [enhanced web search](../2026-09-01-enhanced-web-search/spec.md), [Code Quality and Security](../../docs/code-quality-and-security.md) |

## 1. Problem / Motivation

The provider credential migration removed API keys from the ordinary user settings JSON, but enhanced web-search settings still save Tavily and Firecrawl keys directly in `.emile/web.json`. This contradicts the CLI's credential boundary and leaves two billable secrets in a readable JSON file, even when the file mode is restricted.

The enhanced web-search mode is already supported and its provider state can be enabled independently. This change preserves that behavior while moving its credentials into the same protected store used for primary provider keys.

## 2. Goal

Keep enhanced web-search fully usable while ensuring Tavily and Firecrawl credentials are stored only in the protected credential store, migrate existing plaintext enhanced credentials safely, and never print or serialize them in `.emile/web.json`.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-----------|--------------------|
| RF-S01 | Tavily and Firecrawl keys MUST load from protected storage on every startup. | Must |
| RF-S02 | `/tavily` and `/firecrawl` MUST continue accepting masked credential input and persist keys without writing them to JSON. | Must |
| RF-S03 | Existing `.emile/web.json` keys MUST migrate to protected storage and be removed only after successful protected persistence. | Must |
| RF-S04 | Enhanced mode, provider enabled flags and web-search mode MUST continue to work independently. | Must |
| RF-S05 | Missing/corrupt enhanced credentials MUST fail closed without falling back to a different provider or printing secret material. | Must |
| RF-S06 | No new dependency, browser, MCP server or provider API change is allowed. | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|----------|
| **Risk classification** | High — billable web credentials and existing secret migration. |
| **Assets/secrets** | Tavily and Firecrawl API keys, primary provider credentials, sessions and exported messages. |
| **Command execution / file writes** | No model tool execution changes. Startup may rewrite `.emile/web.json` only after successful protected migration. |
| **Untrusted inputs** | Legacy JSON and env values remain configuration data; no secret is passed to a shell or logged. |
| **Negative criteria** | No plaintext key in web/settings JSON, no key in output, no cross-provider fallback, no deletion before successful migration, no weakened web URL/security gates. |

## 5. Out of Scope

- Changing Tavily/Firecrawl request behavior, quotas, URL validation or prompt-injection boundaries.
- Migrating primary provider credentials again.
- Replacing the existing enhanced mode with native OpenRouter search.
- Adding a native credential-manager dependency.

## 6. Acceptance Criteria

- **AC-01:** Given protected Tavily/Firecrawl entries, when the CLI hydrates enhanced web settings, then both keys are available in memory and `.emile/web.json` contains no key fields.
- **AC-02:** Given `/tavily` or `/firecrawl` masked setup, when the key is saved, then it is available in memory, protected storage receives it, and JSON contains no key.
- **AC-03:** Given a legacy `.emile/web.json` with keys, when hydration runs, then protected migration succeeds, both provider flags remain intact, and plaintext fields are removed.
- **AC-04:** Given protected storage failure, when migration or save is attempted, then the legacy key is not deleted, the user receives a bounded actionable error, and no secret is printed.
- **AC-05:** Given enhanced mode with both providers enabled, when web tools are composed, then Tavily and Firecrawl tools remain available and native OpenRouter search remains separately gated.
- **AC-06:** Focused tests, syntax, lint, full-suite report and a real CLI configuration/restart E2E pass with no secret in captured output or JSON.

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|--------|-----------------|
| Existing enhanced configuration is workspace-specific. | Medium | Migrate the current workspace file once; protected entries then survive future workspace changes. |
| A user has only one enhanced provider. | Low | Preserve independent enabled flags and expose only ready tools. |
| Protected storage is unavailable. | High | Fail closed, retain legacy input, show a bounded error and do not claim successful secure persistence. |

## 8. References

- `src/web/config.js` — enhanced settings and key persistence.
- `src/config.js` — protected credential store.
- `test/web-config.test.js` — enhanced configuration coverage.
- `specs/2026-09-01-enhanced-web-search/spec.md` — enhanced search behavior and threat model.
