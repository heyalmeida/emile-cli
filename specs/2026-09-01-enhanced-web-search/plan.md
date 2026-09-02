# Plan: Enhanced web search with Tavily and Firecrawl

| Field | Value |
|-------|-------|
| **Spec** | `2026-09-01-enhanced-web-search` |
| **Status** | `approved` |

---

## 1. Technical Approach

Keep the existing provider-owned OpenRouter tool isolated in
`src/api/provider-tools.js`. Add a local `src/web/` module tree with a parent
capability composer and two provider adapters:

1. Tavily exposes a bounded `searchWeb` function tool.
2. Firecrawl exposes a bounded `browsePage` function tool.
3. The parent composer advertises each tool only when enhanced mode is active
   and the matching provider is both enabled and credentialed.
4. Tavily returns ranked text/source metadata and bounded image references.
   It never invokes Firecrawl.
5. Firecrawl returns rendered Markdown and, for `visual`/`auto`, a screenshot
   attachment descriptor. The agent loop appends a synthetic, explicitly
   untrusted multimodal reference message only if the active model metadata
   confirms image input.
6. Configuration extends the existing persisted settings with backward-
   compatible `webSearchMode`, provider enabled states and provider keys.
   Environment variables remain supported.

No SDK or browser dependency is needed; adapters use the platform `fetch` and
inject it in tests.

## 2. Architectural Compliance

- **Relevant ADR(s):** ADR-0001 remains satisfied (ES modules, Node.js, no
  build step). A new ADR will record the provider-adapter boundary and
  separation of discovery from selective rendering.
- **Architecture document:** the new `src/web/` module owns external web
  validation, provider calls, conditional tool composition and attachment
  normalization. `agent.js` remains the orchestrator and tool protocol owner.
- **Design system:** slash-command output and masked configuration prompts use
  existing UI palette/helpers. No provider module renders directly.

## 3. Security and Threat Model

| Element | Handling |
|---------|----------|
| Command execution and whitelist | Enhanced web tools never execute shell commands. Existing safe-mode and whitelist behavior is unchanged. |
| File writes and `resolveSafePath` | Only existing configuration persistence writes `.emile/config.json`; no page or screenshot is saved. Workspace file handlers are unchanged. |
| LLM inputs (prompt injection / tool args) | Validate query/result bounds and public HTTP(S) URLs at the handler boundary. Delimit remote material and declare it untrusted in the stable system prompt. Do not convert page instructions into higher-priority messages. |
| Secrets (API keys, sessions, exports) | Mask credential entry; reject inline keys; use authorization headers only; redact errors; never include keys in tool results, terminal state, session messages or exports. |
| Controls and negative tests | Cover schemes, embedded auth, localhost, IPv4/IPv6 private ranges, DNS rebinding surface (all resolved addresses), disabled/missing config, timeouts, malformed/empty/large responses, secret-bearing errors and non-vision screenshots. |

`validatePublicWebUrl` accepts injected DNS lookup for deterministic tests. It
normalizes the URL, rejects credentials/fragments and accepts only hosts whose
complete lookup set contains public addresses exclusively. Provider response
URLs are validated again before becoming image attachments.

## 4. Impacted Modules

| Module | Path | Change |
|--------|------|--------|
| Configuration | `src/config.js` | Persist mode/provider states and keys with environment fallbacks. |
| Command registry | `src/commands/index.js` | Register `/tavily` and `/firecrawl`; forward `/websearch` arguments. |
| Command handlers | `src/commands/handlers.js` | Mode/state dispatch and credential-wizard orchestration. |
| Configuration UI | `src/ui/web-config.js` | Masked provider key prompt and bounded status rendering. |
| Prompt input/help | `src/ui/prompt-input.js`, `src/ui/components.js` | Discoverability and help text for new commands/modes. |
| Web parent | `src/web/index.js`, `src/web/definitions.js` | Conditional tool definitions and shared result contract. |
| Web security | `src/web/security.js` | URL/DNS validation, public-IP rules, truncation and redaction. |
| Tavily adapter | `src/web/providers/tavily.js` | Bounded search over direct HTTPS. |
| Firecrawl adapter | `src/web/providers/firecrawl.js` | Rendered Markdown/screenshot request over direct HTTPS. |
| Web handlers | `src/web/handlers.js` | Runtime config gates and normalized tool results. |
| Agent loop | `src/agent/agent.js` | Compose enhanced tools and attach safe multimodal results. |
| Context estimator | `src/agent/session-stats.js` | Include conditionally composed enhanced definitions. |
| Model metadata | `src/models.js` | Preserve/derive image-input capability from live/static metadata. |
| System prompt | `src/prompt.js` | Stable untrusted-web-content boundary. |

## 5. Impacted Flags / Slash Commands / Tools

| Type | Name | Change |
|------|------|--------|
| Slash command | `/websearch [on\|off\|native\|enhanced\|status]` | Preserve no-argument toggle and add explicit mode/state control. |
| Slash command | `/tavily [on\|off\|status]` | No argument opens masked setup; arguments control/report state. |
| Slash command | `/firecrawl [on\|off\|status]` | No argument opens masked setup; arguments control/report state. |
| Tool | `searchWeb` | Tavily-ranked enhanced discovery, up to seven results and three image references. |
| Tool | `browsePage` | Firecrawl rendered Markdown and optional single screenshot. |

## 6. Files to Create/Modify

| Action | Path (expected) | Notes |
|--------|-----------------|-------|
| Create | `src/web/index.js` | Public web-capability barrel/composer. |
| Create | `src/web/definitions.js` | OpenAI-format enhanced tool definitions. |
| Create | `src/web/security.js` | URL, IP, DNS, output and error boundaries. |
| Create | `src/web/handlers.js` | Config-gated dispatcher handlers. |
| Create | `src/web/providers/tavily.js` | Tavily REST adapter. |
| Create | `src/web/providers/firecrawl.js` | Firecrawl REST adapter. |
| Create | `src/ui/web-config.js` | Masked setup/status UI. |
| Create | `test/web-security.test.js` | SSRF and redaction tests. |
| Create | `test/web-providers.test.js` | Provider contract/error/bounds tests. |
| Modify | `src/config.js` | Settings and environment support. |
| Modify | `src/commands/index.js` | Command registration. |
| Modify | `src/commands/handlers.js` | Command behavior. |
| Modify | `src/ui/index.js` | Export web configuration UI. |
| Modify | `src/ui/prompt-input.js` | Slash-command suggestions. |
| Modify | `src/ui/components.js` | Help/status discoverability if applicable. |
| Modify | `src/agent/agent.js` | Tool composition/result attachments. |
| Modify | `src/agent/session-stats.js` | Context estimate. |
| Modify | `src/models.js` | Image-input metadata. |
| Modify | `src/prompt.js` | Untrusted web boundary. |
| Modify | `test/commands.test.js` | Command modes and secret-free states. |
| Modify | `test/provider-tools.test.js` | Native-mode regression. |

## 7. Technical Decisions (summary)

- Enhanced search is a mode, not a replacement for native OpenRouter search.
- Tavily discovery and Firecrawl rendering are separate tools under one parent
  capability to control cost and latency.
- Enhanced tools are local function tools and therefore provider-independent.
- Images enter the model only as validated multimodal references and only when
  image-input support is known.
- No automatic retries are performed for billable enhanced calls.
- Provider adapters depend on injected `fetch`/DNS functions in tests rather
  than on new packages.

These decisions will be recorded in ADR-0003 during documentation sync.

## 8. Verification Strategy and Gates

- Unit-test URL normalization and every denied IP/scheme/credential class.
- Unit-test DNS all-address validation and ensure provider `fetch` is not called
  on rejected URLs.
- Unit-test Tavily request bounds, result/image normalization, empty/malformed
  payloads, timeout/auth/quota errors and absence of Firecrawl side effects.
- Unit-test Firecrawl request format, Markdown truncation, screenshot
  validation and text-only behavior when model vision is unknown.
- Unit-test config migration from the existing boolean and state/credential
  command behavior without rendering secret values.
- Regression-test the existing OpenRouter tool schema byte-for-byte.
- Run `node --check` for every touched source/test file, `npm test`, `npm run
  lint`, `git diff --check` and the CLI smoke test.
- Manual UI checks at 60, 80 and 120 columns; cancel masked setup with Esc;
  interrupt with Ctrl+C; inspect captured output for ANSI leakage and secrets.
- Live provider calls are optional and require user-owned keys; if not run,
  record the limitation instead of claiming end-to-end provider validation.

## 9. Git Workflow

| Item | Answer |
|------|--------|
| **Feature branch** | `feat/agent-loop`, the existing canonical domain branch, synchronized from current `development` before source changes |
| **Documentation branch** | `docs/documentation` for README, docs, specs, features, CHANGELOG and ADR |
| **Commit plan** | Spec first on `docs/documentation`; implementation/tests in coherent commits on `feat/agent-loop`; closing docs on `docs/documentation`; explicit staging paths only. |

## 10. Failures, Partial State and Rollback

| Topic | Strategy |
|------|----------|
| Error handling and user-facing messages | Return concise provider/action guidance with sanitized status; never echo response bodies or authorization data. |
| Interruption (Ctrl+C / Esc) and readline state | Masked setup cancellation leaves prior settings unchanged and returns terminal activity to waiting. |
| Partial state (session, undo stack, file cache) | Persist provider config atomically through the existing config writer; web calls do not affect undo/file cache. Screenshot attachments persist only as normal bounded session messages. |
| Rollback / undo | `/websearch native` or `/websearch off` disables enhanced composition; `/tavily off` and `/firecrawl off` independently remove their tool definitions without deleting keys. |

## 11. Technical Risks and Trade-offs

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Synthetic multimodal reference messages differ across gateways | Medium | Gate on known image support, use OpenAI-compatible content parts and retain Markdown fallback. |
| DNS state can change after validation | Low/Medium | Reject any non-public resolution and rely on fixed remote services fetching the target, not the user's host network. |
| Image URLs expire | Medium | Consume in the immediate next model call and do not promise durable visual history. |
| Two providers increase configuration surface | Medium | One parent mode, independent status commands and actionable missing-key output. |
| Provider response schema changes | Medium | Defensive normalization, bounded outputs and adapter-specific tests. |
