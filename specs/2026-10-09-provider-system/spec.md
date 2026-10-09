# Spec: Provider system — multi-slot credentials, `/provider` switching and custom endpoints

| Field | Value |
|-------|-------|
| **ID** | `2026-10-09-provider-system` |
| **Status** | `approved` |
| **Date** | 2026-10-09 |
| **Phase/Context** | Phase 2 — Configuration & Transport |
| **Related documents** | [Deep Dive §8.4](../../docs/deep-dive.md), [Architecture](../../docs/architecture.md), [Code Quality and Security](../../docs/code-quality-and-security.md), [ADR-0001](../../docs/adr/0001-tech-stack-choice.md), [ADR-0002](../../docs/adr/0002-quality-gates.md) |

---

## 1. Problem / Motivation

*What user pain are we solving? Why now? Reference the PRD (RF-XX) or the roadmap item that justifies it.*

Today `~/.emile/config.json` is a **single-slot, flat** schema (`provider`, `apiKey`, `model`, `effort`, `webSearch`, `maxLoopIterations`) and the consequences are verified in the code:

- **Switching providers destroys the other key.** `saveUserConfig()` (`src/config.js`) persists one flat `apiKey` field; writing provider B overwrites provider A's stored key. The only working multi-key setup today is per-shell environment variables via `ENV_KEY_MAP` (`REQUESTY_API_KEY` / `OPENROUTER_API_KEY` / `OPENCODE_API_KEY`) — manual, invisible to the average user, and a trap for Zen/Go which share `OPENCODE_API_KEY`.
- **`/connect` is a ritual, not a manager.** `runConnectWizard()` (`src/commands.js`) always asks `password()` for the key and then forces `model: providerDef.defaultModel`, so returning to a previously used provider both re-asks the secret and resets the model you had chosen there.
- **There is no `/provider`.** The dispatch map in `src/commands/index.js` has `/connect` but no switch command, and `src/commands/registry.js` lists no `/provider` row, so "two keystrokes to swap" does not exist.
- **No custom endpoints.** `getClient()` (`src/api/client.js`) hardcodes four gateway base URLs (Requesty, OpenRouter, OpenCode Zen, OpenCode Go) and caches the instance on `apiKey + provider` only. Any OpenAI-compatible server (llama.cpp, vLLM, Ollama, a corporate proxy, a self-hosted router) is unreachable, and a user switching between two *custom* endpoints sharing an empty key would get a stale cached client.
- **Only the `chat-completions` shape is spoken.** Anthropic-native (`/v1/messages`) and OpenAI Responses SSE endpoints cannot be used at all.

Roadmap justification: deep-dive § 21.1 **P1-6 "Multi-slot de credencial + `/provider`"**, extended here with the custom-endpoint and extra-transport work that the same storage layer unlocks. The security invariant that constrains the whole design is documented in § 8.4 and IMPROVEMENTS § 1.4: **cross-provider silent key fallback was deliberately removed and must never come back**.

## 2. Goal

*The desired outcome, in one or two measurable sentences.*

Make provider management a first-class, zero-retyping experience: store one credential+model slot per provider in `config.json` v2 (migrating legacy v1 on load), switch active provider in two keystrokes via a new `/provider` command that restores that provider's `lastModel` and re-syncs the context limit, and let users register custom OpenAI-compatible endpoints (plus, in Stage B, `anthropic-messages` and `responses` transports) — all without weakening the existing per-provider key isolation, the `0600` credential file, or the "keys never in logs/errors" policy.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-----------|---------------------|
| RF-S01 | `config.json` v2 storage schema (see contract below) | Must |
| RF-S02 | Legacy v1 migration on load; flat fields removed on next save | Must |
| RF-S03 | Per-slot `lastModel` persistence and restore | Must |
| RF-S04 | `resolveApiKey(id)` isolation: slot → env var (`ENV_KEY_MAP`) → `''` | Must |
| RF-S05 | `/connect` becomes a conditional credential manager (Keep / Update / Remove / list-all) | Must |
| RF-S06 | Custom-endpoint wizard: name/slug, base URL, key, format, model | Must |
| RF-S07 | `/provider` slash command: two-keystroke switch with context re-sync | Must |
| RF-S08 | `/model` accepts manual identifier entry for custom providers | Must |
| RF-S09 | `getClient()` cache key is `provider + apiKey + baseURL + format` | Must |
| RF-S10 | `chat-completions` custom transport branch in `getClient()` / `createChatCompletion` | Must |
| RF-S11 | Stage B transports: `anthropic-messages` and `responses` SSE | Should |
| RF-S12 | Security gates: transport allow-list, no redirect credential forwarding, masked listings, keyless local-only | Must |

### 3.1 Storage contract — `~/.emile/config.json` (v2)

```json
{
  "version": 2,
  "activeProvider": "openrouter",
  "providers": {
    "requesty":    { "apiKey": "...", "lastModel": "anthropic/claude-3-5-sonnet", "baseURL": null, "format": "chat-completions", "label": "Requesty" },
    "openrouter":  { "apiKey": "...", "lastModel": "google/gemini-2.5-pro",        "baseURL": null, "format": "chat-completions", "label": "OpenRouter" },
    "opencode":    { "apiKey": "...", "lastModel": "claude-sonnet-4-5",           "baseURL": null, "format": "chat-completions", "label": "OpenCode Zen" },
    "opencode-go": { "apiKey": "...", "lastModel": "deepseek-v4-pro",             "baseURL": null, "format": "chat-completions", "label": "OpenCode Go" },
    "my-llama":    { "apiKey": "",    "lastModel": "qwen3-8b",                   "baseURL": "http://127.0.0.1:11434/v1", "format": "chat-completions", "label": "My llama.cpp" }
  },
  "effort": "low",
  "webSearch": false,
  "maxLoopIterations": 90
}
```

Contract rules (normative):

1. `version` is the integer `2`. Absence of `version` implies a legacy v1 document.
2. `activeProvider` is the provider id; it is the **only** active-provider pointer (v1 `provider` is the legacy alias).
3. `providers` is a map keyed by provider id. The four **reserved gateway ids** are `requesty`, `openrouter`, `opencode`, `opencode-go`. Custom ids are **kebab-case slugs** (`^[a-z0-9]+(-[a-z0-9]+)*$`) that must not collide with a reserved id.
4. Per-slot fields: `apiKey` (string, may be empty only under the rule below), `lastModel` (string), `baseURL` (string|null; non-null only for custom endpoints), `format` (`"anthropic-messages" | "chat-completions" | "responses"`), `label` (human name).
5. The four reserved gateway ids **always resolve to `format: "chat-completions"`** with their hardcoded base URLs; a `baseURL`/`format` override on a reserved id is ignored at client-build time.
6. Top-level fields `effort`, `webSearch`, `maxLoopIterations` remain global (not per-slot).
7. An empty `apiKey` is allowed **only** when the slot's `baseURL` is `http://localhost…`, `http://127.0.0.1…` or its `https://` equivalent. Any other slot with an empty key is invalid and fails closed.
8. **Legacy v1 migrates on load.** A v1 document (flat `provider`/`apiKey`/`model`) is normalized in memory at load: the flat key becomes `providers[<provider>].apiKey` and the flat model becomes that slot's `lastModel`. On the next `saveUserConfig()` the flat fields are **removed** from the file (the file becomes v2-only).
9. `resolveApiKey(id)` resolves in exactly this order: (a) the slot key `providers[id].apiKey` when non-empty → (b) the provider-specific env var from `ENV_KEY_MAP` when non-empty → (c) the empty string `''`. It **never** returns another provider's key.
10. The in-memory `config` singleton keeps `provider`, `apiKey` and `defaultModel` as **views of the active slot** (`config.provider === config.activeProvider`, `config.apiKey === resolveApiKey(activeProvider)`, `config.defaultModel === providers[activeProvider].lastModel`) so that every existing consumer keeps working unchanged.
11. The file is still written with mode `0600`; now guarding N keys instead of one.
12. The v2 document is normalized by **hand-rolled defensive parsing** in the `src/config.js` load pipeline (`readConfig()` normalization + `writeState()`); **no `zod` schema is used for this feature**. Unknown/invalid slots and unknown/invalid per-slot fields are silently dropped, custom slots without a non-empty `baseURL` are discarded, and a malformed document falls back to the default gateway view — never a crash.

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|----------|
| **Risk classification** | **High** — the feature changes the cardinality of credentials at rest (1 → N keys in one `0600` JSON file) and lets the user point the client at arbitrary URLs. Worst case: an API key is transmitted in cleartext to an attacker-chosen host, or leaked into logs/exports. |
| **Assets/secrets** | Gateway API keys (potentially N per file, including paid OpenRouter/OpenCode subscriptions), custom-endpoint base URLs (may reveal internal infrastructure hostnames), session exports. |
| **Command execution / file writes** | No `runCommand`, no tool handlers, no workspace file writes. The only write is `~/.emile/config.json` via `saveUserConfig()` with `{ mode: 0o600 }` and best-effort `chmodSync(0o600)`. `safeMode` / `dryRun` / `resolveSafePath` gates are not engaged because the path is a fixed user-home path, never a workspace-relative user-supplied path. |
| **Untrusted inputs** | Provider labels, custom slugs, base URLs, format names and model ids come from the user via clack prompts or a hand-edited config file. Validation: slug regex, URL parsed with the `URL` constructor, `format` restricted to the three-value enum, model id length-capped and stripped of CR/LF/tab before display. Prompt output must never echo an `apiKey` field. |
| **Negative criteria** | See below — these four are mandatory and reappear in `plan.md` § 3 and `tasks.md` Phase 2. |

### 4.1 Threat model as negative acceptance criteria (mandatory)

1. **Credentials never follow a redirect.** No API key may be transmitted to a host other than the one in the slot's `baseURL`. Redirect-following must be disabled or the `Authorization` header stripped on any cross-origin hop.
2. **Keys are never printed, logged or included in error messages.** Masked listings may show **at most the last 4 characters** of a key; `formatApiError()` redaction of `Bearer …` / `api_key=…` patterns must continue to apply, and no code path may write a key to stdout, stderr, a session file, an export or `~/.emile/config.json` diagnostics output.
3. **`http://` is allowed only for `localhost` / `127.0.0.1`, enforced at write time *and* at client-build time.** A hand-edited config smuggling a remote `http://` URL must **fail closed at `getClient()`** with an actionable message and **no network call** of any kind.
4. **Per-provider key isolation.** Slot B's key must never resolve for slot A — the cross-provider silent fallback removed in IMPROVEMENTS § 1.4 stays removed.

> For high risk, the negative and abuse criteria are mandatory and must reappear in the plan and the tests. See [Code Quality and Security](../../docs/code-quality-and-security.md).

## 5. Out of Scope

*What will explicitly NOT be done in this spec (to avoid scope creep).*

- **Docs sync is a later stage.** Rule 2 doc sync, the Rule 7 `features/` registry entry and index, the `features/README.md` index, `CHANGELOG.md` and `README.md` updates are **not** part of the implementation stage of this spec — they are Phase 3 tasks, executed after the code lands.
- **Agent stream-consumption contract untouched.** The shape the agent loop consumes (message array, tool-call deltas, reasoning deltas, abort semantics, retry semantics, `streamWithRetries` behaviour) must not change. New transports must normalize into the **existing** delta contract.
- **Gateway HTTP behavior must be byte-for-byte unchanged.** For the four reserved ids the request body, headers (`HTTP-Referer`, `X-Title`), reasoning parameters, `requesty.auto_cache` hint, `stream_options`, retry/backoff and error mapping stay exactly as they are today.
- **Stage B transports (`anthropic-messages`, `responses` SSE) are explicitly deferred to a later dispatch.** They are specified here and listed as unchecked tasks, not implemented in the first pass.
- No new runtime dependencies (`zod` is **not** used for this feature — config parsing is hand-rolled; no HTTP client library beyond the existing `openai` SDK and Node built-ins).
- No changes to token accounting, cost tables, compression gates, MCP, skills, plans mode, memory, or session persistence formats.
- No provider-side provisioning: emile never creates, rotates, validates or refreshes keys; it only stores what the user types.

## 6. Acceptance Criteria

*Each criterion must be objectively verifiable (Given/When/Then format when it makes sense).*

- **AC-01 (v2 schema):** Given a fresh install, when `/connect` stores a credential, then `~/.emile/config.json` contains `version: 2`, `activeProvider`, and a `providers` map whose entry for that id carries `apiKey` and `lastModel` (gateway slots store only these two; `baseURL` / `format` / `label` are custom-slot fields); and the file mode is `0600`.
- **AC-02 (key isolation on write):** Given provider A and provider B each have a stored key, when B is configured or updated via `/connect`, then `providers[A].apiKey` is byte-for-byte unchanged in the saved file. *(deep-dive 8.4 test (a))*
- **AC-03 (resolveApiKey isolation):** Given only `providers.openrouter.apiKey` is set, when `resolveApiKey('requesty')` is called with no `REQUESTY_API_KEY` in the environment, then it returns `''` — never the OpenRouter key. *(deep-dive 8.4 test (b); threat item 4)*
- **AC-04 (legacy migration):** Given a v1 `config.json` with flat `provider: "openrouter"` and a flat `apiKey`, when the app loads config, then the in-memory config has `providers.openrouter.apiKey` equal to that key and `defaultModel` equal to the flat `model`; and after the next `saveUserConfig()` the saved document has **no** top-level `apiKey` / `provider` / `model` fields and has `version: 2`. *(deep-dive 8.4 test (c))*
- **AC-05 (`/provider` on a keyless slot):** Given the target provider slot has no stored key and no env var, when it is chosen in `/provider` (which takes no argument in Stage A), then the CLI prints exactly `No key configured — run /connect to set one.` and **does not** prompt for a password and does not read stdin. *(deep-dive 8.4 test (d))*
- **AC-06 (context re-sync):** Given the session was using a 200K-window model, when `/provider` switches to a provider whose `lastModel` has a 128K window, then `sessionStats.contextLimit` equals 128000 afterwards (`initSessionStats` re-run with the new model). *(deep-dive 8.4 test (e))*
- **AC-07 (two-keystroke switch):** Given providers A and B both configured, when `/provider` → B is selected, then within one turn `config.provider === 'B'`, `config.defaultModel === providers.B.lastModel`, the client instance was reset, the terminal title and config box were reprinted, and no password prompt appeared.
- **AC-08 (`lastModel` round-trip):** Given A→B→A switching with no manual model choice in between, then the model after returning to A equals the model recorded in `providers.A.lastModel` before leaving A.
- **AC-09 (`/connect` conditional manager):** Given a configured provider X, when `/connect` targets X, then the options offered are exactly *Keep* (no password prompt), *Update key* (password prompt) and *Remove credential* (deletes only that slot's key); switching providers is `/provider`'s responsibility, not `/connect`'s; and `/connect` with no target lists every provider as configured / from env / missing with masked keys (≤ last 4 chars).
- **AC-10 (custom endpoint wizard):** Given the user picks "add custom endpoint", when they enter a name, a URL, a key, a format and a model, then a kebab-case slug is derived, the slot is persisted with the chosen `baseURL` and `format`, the id appears in `/provider` and in the `/connect` listing, and a slug collision or a non-conforming URL is rejected inline without writing.
- **AC-11 (`/model` manual entry for custom):** Given the active provider is a custom endpoint, when the user picks "enter identifier manually" in `/model`, then the typed identifier is validated, saved as that slot's `lastModel`, and the config box is reprinted.
- **AC-12 (client cache key):** Given two custom endpoints with **different** base URLs but the **same empty** API key, when `getClient()` is called for each in turn, then it returns a client bound to the correct base URL each time (no stale instance), and `resetClient()` forces a rebuild.
- **AC-13 (custom chat-completions transport):** Given a custom slot with `format: "chat-completions"`, when a streaming turn runs, then the request goes to the slot's `baseURL` with the stored key as bearer auth and the existing retry/error/redaction path is used unchanged.
- **AC-14 (**threat item 1 — redirect**):** Given a custom `baseURL` whose server answers `302` to a different origin, when a request is made, then the API key is **not** sent to the redirect target (either no redirect is followed or the `Authorization` header is stripped), and the failure surfaces as an actionable error.
- **AC-15 (**threat item 2 — no key leakage**):** Given a configured key, when `/connect` lists providers, an error occurs, a session is exported, or a debug flag is on, then no full key appears in stdout/stderr/file; a masked view shows at most the last 4 characters; `formatApiError()` output contains no `Bearer <key>` and no `apiKey=<key>`.
- **AC-16 (**threat item 3 — http:// gate**):** Given a config hand-edited so a non-local slot has `baseURL: "http://evil.example.com/v1"`, when `getClient()` is called, then it **throws/fails closed with an actionable message and performs no network call**; and the same URL is rejected at write time by the wizard.
- **AC-17 (**threat item 4 — key isolation**):** Given slots A and B with distinct keys, when the active provider is switched to B and back to A, then each turn's `Authorization` header contains only the active slot's key.
- **AC-18 (reserved id invariants):** Given a hand-edited config setting `baseURL`/`format` on `requesty` or `openrouter`, when `getClient()` runs, then the hardcoded gateway URL and `format: "chat-completions"` win, and request bytes are unchanged from the pre-feature behavior.
- **AC-19 (views, not copies):** Given an in-memory session after any switch, then `config.provider === config.activeProvider`, `config.apiKey === resolveApiKey(config.activeProvider)` and `config.defaultModel === providers[config.activeProvider].lastModel`, with no consumer needing modification.
- **AC-20 (Windows / test suite):** Given a Windows checkout, when `npm run lint`, `node --test test/provider-config.test.js`, `node --test test/config-permissions.test.js` and `npm test` are run, then all pass; the config file path uses `os.homedir()` and no POSIX-only assumptions break the suite.

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|---------|---------------------|
| Storing N keys in one `0600` file increases blast radius of a file read | Medium | Same file, same mode; already the location of one key. Masked listings limit UI leakage; no key ever leaves the file except as an auth header to the slot's own base URL. |
| Cache-key change could regress client reuse for gateways | Medium | Cache key is a strict superset (`+ baseURL + format`); for reserved ids baseURL/format are derived constants, so reuse behavior is identical. Covered by AC-12/AC-18. |
| Hand-edited config smuggling a remote `http://` URL | High | Dual enforcement: write-time validation in the wizard + fail-closed in `getClient()` before any socket is opened (AC-16). |
| Redirect from a custom endpoint leaking the bearer token | High | Explicit negative criterion; tested (AC-14). |
| Stage B transports balloon the diff | Medium | Stage B is a separate, unchecked phase; Stage A ships independently. |
| Open question: should `/provider` also switch `effort`? | Low | Out of scope — `effort` stays a global top-level field per the v2 contract. |
| Open question: per-provider `webSearch` availability | Low | Out of scope — remains global; a warning already exists for native search on non-supporting providers. |

## 8. References

- Product/architecture documents consulted: [docs/product.md](../../docs/product.md), [docs/architecture.md](../../docs/architecture.md), [docs/deep-dive.md §8.4](../../docs/deep-dive.md), [docs/code-quality-and-security.md](../../docs/code-quality-and-security.md), [docs/visual-identity.md](../../docs/visual-identity.md), [docs/IMPROVEMENTS.md §1.4](../../docs/IMPROVEMENTS.md)
- Related ADRs: [ADR-0001 Tech Stack](../../docs/adr/0001-tech-stack-choice.md), [ADR-0002 Quality Gates](../../docs/adr/0002-quality-gates.md)
- Related specs: [specs/README.md](../README.md), `specs/2026-08-25-model-system/`, `specs/2026-08-30-dynamic-model-catalog-ui/`
- Source modules read for this spec (unchanged by it): `src/config.js`, `src/api/client.js`, `src/commands.js`, `src/commands/handlers.js`, `src/commands/index.js`, `src/commands/registry.js`