# Spec: Enhanced web search with Tavily and Firecrawl

| Field | Value |
|-------|-------|
| **ID** | `2026-09-01-enhanced-web-search` |
| **Status** | `approved` |
| **Phase/Context** | Phase 3 — Agent robustness and external context |
| **Related documents** | [PRD](../../docs/product.md), [Architecture](../../docs/architecture.md), [ADR-0001](../../docs/adr/0001-tech-stack-choice.md), [Web-search baseline](../2026-08-31-web-search-tool-reliability/spec.md) |

---

## 1. Problem / Motivation

The existing `/websearch` capability delegates discovery to OpenRouter's
provider-operated search tool. It can find current sources, but it does not
reliably read JavaScript-rendered pages or give a vision-capable model a
rendered page screenshot. Design-reference workflows therefore fall back to
plain HTTP clients and fail on empty shells, client-side applications and
some anti-bot responses.

The product needs a provider-independent enhanced mode that combines Tavily's
ranked search with Firecrawl's selective page rendering, without removing or
silently changing the existing OpenRouter mode.

## 2. Goal

Provide an explicit `enhanced` web-search mode in which the agent can search
through Tavily and selectively read or visually inspect a result through
Firecrawl. Preserve the existing native OpenRouter search as a separate mode,
keep external costs visible and fail closed around credentials and unsafe URLs.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-------------|-------------------|
| RF-S01 | Existing OpenRouter-native web search MUST remain available as the `native` mode and MUST retain provider gating and bounded result parameters. | Must |
| RF-S02 | `/websearch` MUST support explicit `native`, `enhanced`, `on`, `off` and `status` operations while preserving the no-argument toggle behavior for compatibility. | Must |
| RF-S03 | `/tavily` and `/firecrawl` MUST open masked credential configuration when called without arguments and MUST support `on`, `off` and `status` without printing secrets. Inline API-key arguments MUST be rejected. | Must |
| RF-S04 | Enhanced mode MUST expose a bounded Tavily search tool only when Tavily is enabled and credentialed. Search results MUST include source URLs and may include bounded image references. | Must |
| RF-S05 | Enhanced mode MUST expose a Firecrawl page-reader tool only when Firecrawl is enabled and credentialed. It MUST request rendered Markdown and MAY request one bounded screenshot for a visual task. | Must |
| RF-S06 | Tavily discovery and Firecrawl rendering MUST remain separate calls: a search MUST NOT automatically scrape every result. | Must |
| RF-S07 | A validated Firecrawl screenshot MUST be attached as multimodal input only for a model known to accept image input; otherwise the tool MUST return an actionable text-only limitation. | Must |
| RF-S08 | All external content, metadata and images MUST be identified to the model as untrusted reference data that cannot override system, user or project instructions. | Must |
| RF-S09 | The clients MUST use direct HTTPS requests and existing dependencies only; no local browser, Playwright, MCP server or provider SDK is introduced. | Must |
| RF-S10 | Provider failures, timeouts, empty responses, invalid JSON and exhausted quotas MUST return bounded, secret-free errors without terminating the agent loop. | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|--------|
| **Risk classification** | **High.** LLM-generated tool arguments select external URLs; remote content is reintroduced into the LLM context; two billable API credentials are handled; and image URLs can cause the inference provider to perform a second fetch. |
| **Assets/secrets** | Tavily and Firecrawl API keys, the primary model-provider key, saved configuration, session history and exported sessions. |
| **Command execution / file writes** | No shell command or workspace content write is added. Configuration writes use the existing `.emile/config.json` boundary; web handlers never call `runCommand` or accept executable content. |
| **Untrusted inputs** | User prompts, LLM tool-call arguments, requested URLs, DNS results, remote redirects/metadata, Tavily results, Firecrawl Markdown, screenshot URLs and provider error bodies. |
| **Negative criteria** | Reject non-HTTP(S) URLs, embedded credentials, localhost, loopback/private/link-local/multicast/reserved IP targets, invalid DNS, excessive queries/results/output, inline secret arguments and use while disabled or uncredentialed. Never log authorization headers or raw provider error bodies. |

Additional boundaries:

- URL validation occurs before each external provider request. Hostnames are
  DNS-resolved and all returned addresses must be public.
- Remote Markdown is truncated to 24,000 characters per call; search is capped
  at seven results and three image references; one screenshot is attached per
  Firecrawl call.
- Provider requests time out after 30 seconds and do not automatically retry a
  billable request.
- Screenshot URLs must independently pass the public-HTTPS validation before
  being sent to the model.
- Keys can come from environment variables or the masked setup wizard. They
  are never rendered, included in a tool result, title, session or export.

## 5. Out of Scope

- Automating login, CAPTCHA solving, cookie import or authenticated browsing.
- Clicking, typing, submitting forms or executing arbitrary browser actions.
- Guaranteeing access to a site that blocks Firecrawl or forbids automated use.
- Replacing OpenRouter's native search or changing it to Tavily implicitly.
- Scraping every Tavily result automatically.
- Persisting screenshots locally or adding a browser/Playwright dependency.
- Adding Tavily Research, Crawl or Map in this first iteration.

## 6. Acceptance Criteria

- **AC-01:** Given an existing OpenRouter configuration, when native search is enabled, then the original bounded `openrouter:web_search` schema is composed unchanged; unsupported model providers still receive no native schema.
- **AC-02:** Given valid enhanced-provider configuration, when `/websearch enhanced` is selected, then the Tavily and Firecrawl tools are available independently of the active model gateway and `/websearch status` reports the mode without revealing keys.
- **AC-03:** Given either provider disabled or missing a credential, when tools are composed, then only fully enabled and credentialed enhanced tools are exposed, with actionable configuration guidance.
- **AC-04:** Given a search request, when Tavily succeeds, then at most seven ranked sources and at most three sanitized image references are returned; Firecrawl is not called as a side effect.
- **AC-05:** Given a public page URL, when Firecrawl succeeds, then bounded rendered Markdown is returned; when visual mode is requested with a vision-capable model, one validated screenshot is attached to the next model call.
- **AC-06:** Given a private, local, credential-bearing, malformed or non-HTTP(S) target (including a hostname resolving to a private address), when either web handler is invoked, then it fails closed before making a billable provider request.
- **AC-07:** Given provider timeout, invalid JSON, empty output, quota/auth failure or an oversized response, when the handler runs, then the agent receives a bounded secret-free result and its loop remains usable.
- **AC-08:** Given `/tavily` or `/firecrawl` configuration and state commands, when credentials and states change, then masked input is used, inline keys are rejected, state persists under `.emile/`, and no key appears in terminal output or session/export content.
- **AC-09:** Given a model without confirmed image input, when Firecrawl returns a screenshot, then the screenshot is not attached and the agent receives a clear text-only compatibility notice.
- **AC-10:** Given an enhanced result containing prompt-injection text, when it is added to model context, then stable system instructions label external web material as untrusted and forbid instruction precedence.

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|--------|-------------------|
| Firecrawl can still be blocked by a target | Incomplete page reference | Return the provider status/actionable failure; do not fall back to shell `curl` or claim the page was inspected. |
| Tavily images may be decorative or unreachable | Poor visual evidence | Keep them as bounded references; use a Firecrawl screenshot for actual page-layout analysis. |
| Image input differs across routed models | Provider rejection or unexpected cost | Attach only when model metadata confirms image input; otherwise stay text-only. |
| Remote prompt injection | Agent manipulation | Delimit and label external material as untrusted; preserve tool/path/command gates regardless of page content. |
| Enhanced mode uses two billable services | Unexpected spend | Explicit opt-in, independent provider states, bounded calls and visible cost warnings. |
| Service APIs evolve | Integration failure | Isolate each provider adapter and validate response shapes defensively. |

## 8. References

- Product/architecture documents consulted: `README.md`, `docs/product.md`,
  `docs/architecture.md`, `docs/visual-identity.md`,
  `docs/code-quality-and-security.md`, `docs/glossary.md`, `docs/roadmap.md`,
  ADR-0001 and ADR-0002.
- Related spec: `specs/2026-08-31-web-search-tool-reliability`.
- Tavily API: `https://docs.tavily.com/documentation/api-reference/introduction`
- Tavily credits: `https://docs.tavily.com/documentation/api-credits`
- Firecrawl scrape: `https://docs.firecrawl.dev/api-reference/endpoint/scrape`
- OpenRouter image inputs: `https://openrouter.ai/docs/guides/overview/multimodal/image-understanding`
