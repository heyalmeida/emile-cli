# Plan: Provider system — multi-slot credentials, `/provider` switching and custom endpoints

| Field | Value |
|-------|-------|
| **Spec** | `2026-10-09-provider-system` |
| **Status** | `draft` |
| **Date** | 2026-10-09 |

---

## 1. Technical Approach

*Solution overview: which `src/` modules are affected, patterns to use and why.*

**Stage A — storage, switching and the `chat-completions` custom transport.**

**`src/config.js` — storage layer + views.** Introduce the v2 document shape normalized by hand-rolled defensive parsing (no `zod` schema) and split the current single object into three concerns:

- `readConfigDocument()` / `writeConfigDocument()` — pure-ish IO that reads, migrates and writes `~/.emile/config.json` (mode `0600`, best-effort `chmodSync` preserved). Migration runs once at load: a v1 flat document becomes `{ version: 2, activeProvider, providers: { [provider]: { apiKey, lastModel, baseURL: null, format: 'chat-completions', label } } }`.
- Document normalization — the load pipeline (`readConfig()` normalization + `writeState()`): unknown/invalid slots and fields are silently dropped, custom slots without a non-empty `baseURL` are discarded, defaults are coerced, and a malformed document falls back to the default gateway view instead of crashing. Unit-testable without touching the filesystem (AC-04).
- `isValidProviderURL(url)` — pure guard: `new URL(url)` must parse, protocol must be `https:` **or** (`http:` with hostname `localhost`/`127.0.0.1`). Used by both the write path and `getClient()`.
- `resolveApiKey(id)` — keeps its current signature and its `''` terminal, but the first branch becomes `providers[id].apiKey` instead of the flat field.
- The `config` singleton keeps `provider` / `apiKey` / `defaultModel` as **views** of the active slot — plain mutable fields refreshed by `refreshViews()` from `saveUserConfig()` / `setActiveProvider()` / `removeProvider()`. Same consumer contract (a view, never duplicated state), simpler mechanism (AC-19). `saveUserConfig(settings)` gains slot-aware fields (`provider`, `apiKey`, `model` → writes into the active/target slot, plus `providers` mutations for add/remove) and always serializes v2 — which is what strips the legacy flat fields on the next save.

**`src/commands.js` — wizard layer.** `PROVIDERS` gains `custom: true` entries and an "Add custom endpoint…" item. `runConnectWizard()` branches:

- **existing key** → conditional manager with *Keep* / *Update key* / *Remove credential*, no password prompt on *Keep* (switching is `/provider`'s job, not `/connect`'s);
- **no key, reserved id** → today's wizard, unchanged model validation (`isDynamicCatalogActive()` + `isKnownModel` + `runModelWizard()`);
- **no key, custom id** → the custom-endpoint wizard: display name → derived kebab-case slug (validated, collision-checked) → base URL (`isValidProviderURL`) → key (password prompt, empty allowed **only** for local http/https) → format select among the three enum values → model (picker or manual `text()`), then `saveUserConfig({ addProvider })` + `resetClient()`.

`runModelWizard()` already handles a `providerDef` with no catalog; for custom slots it renders the manual-entry branch and persists into `providers[id].lastModel` (AC-11).

**`src/commands/handlers.js` — `handleProvider(ctx)`.** Follows the `handleConnect` pattern exactly: `setTerminalActivity('switching provider')` → `ctx.select`-style provider list rendered via `C.*` (marking which slots have keys) → on a keyed slot: `setActiveProvider(id)` (not `saveUserConfig({ provider })`) → `resetClient()` → `ctx.initSessionStats(ctx.config.defaultModel, ctx.config.plansMode, ctx.activeSkills, ctx.getMessages())` so `contextLimit` matches the new window (AC-06) → `configureTerminalTitle({ model })` + `printConfigBox({...})` reprint. On a keyless slot: print exactly `No key configured — run /connect to set one.` and **return without touching stdin** (AC-05). All I/O and prompts are injected through `ctx`, so the handler stays testable.

**`src/commands/index.js` + `src/commands/registry.js` — registration.** Add `handleProvider` to the imports, a `['/provider', handleProvider]` entry in the `COMMANDS` map (dispatch) and a `{ root: '/provider', description: 'Switch between configured providers' }` row in `ROOT_COMMANDS` (help + autocomplete). The prompt-input autocompleter matches by command name, so it picks the label up automatically.

**`src/api/client.js` — cache key + custom branch.** The single instance cache becomes keyed on a 4-part composite: `` `${provider}|${apiKey}|${baseURL}|${format}` `` (AC-12). `getClient()` resolves the effective base URL/format for the active slot: reserved ids keep the current hardcoded table and always `chat-completions`; custom ids use their stored values, re-validated by `isValidProviderURL` — a failure throws an actionable error **before** constructing the client, so no socket is opened (AC-16). Custom `chat-completions` slots build an `OpenAI` instance with `{ apiKey, baseURL, defaultHeaders }` and flow through the existing `createChatCompletion` / `streamWithRetries` path unchanged (AC-13). Byte-for-byte identical requests are guaranteed for the four gateways because their options and body construction are untouched.

**Stage B — transport module.** A new `src/api/transports/` tree, one module per slot format, behind a common interface `{ buildRequest, streamNormalized } → normalized deltas`. The chunk shape every transport yields is frozen by the consumer in `src/agent/agent.js`; the field-level wire detail of each format (request shape, SSE event names, stop-reason mapping, usage sums, the shared HTTP mechanics) is pinned normatively in **spec §9 Annex A** (A.1 `anthropic-messages`, A.2 `responses`, A.3 shared HTTP mechanics) and is **not restated here** — this section only describes the module layout.

- **`src/api/transports/base.js` — shared skeleton.** Owns the parts that are identical across formats: the SSE event parser reading a `fetch` response body reader (frames `data:` lines, tolerates unparsable JSON per AC-28), the streaming retry skeleton moved out of the current inline code with its **existing inline notice strings unchanged**, the error-status / retryable-status / retry-delay helpers relocated from `client.js` (including `Retry-After` honoring), and a collector that aggregates normalized chunks into an OpenAI-shaped response object for non-streaming calls.
- **`src/api/transports/chat-completions.js`** — holds the existing SDK streaming path **relocated verbatim**, with no logic rewrite: same `OpenAI` client, same options, same byte-for-byte request bodies for the four reserved gateways (AC-18, AC-32).
- **`src/api/transports/anthropic-messages.js`** and **`src/api/transports/responses.js`** — the two `fetch` transports. Each exports a **pure request builder** (messages → wire body, no IO) plus a **streaming generator** yielding the frozen chunk shape of Annex A. All wire detail comes from A.1 / A.2 / A.3.
- **`src/api/transports/index.js`** — the barrel, mirroring the style of `src/api/index.js` (re-export one transport per format plus the shared base helpers).
- **`src/api/client.js` becomes the dispatcher.** It resolves the active slot definition, keeps the **exact `createChatCompletion` signature** (same arguments, same resolved value, same stream-consumer contract), drops the Stage A unsupported-format guard, and validates the slot URL through `isValidProviderURL` **before any socket is opened** for the two `fetch` formats. `getClient()` keeps its 4-part composite cache key; reserved gateway ids still resolve to hardcoded URLs and `chat-completions`.

Both `fetch` transports receive the slot definition and an **injectable `fetch` implementation as arguments** (defaulting to `globalThis.fetch`), so the tests stay hermetic, drive real `node:http` loopback fixtures and add **no module state**.

## 2. Architectural Compliance

- **Relevant ADR(s):** [ADR-0001](../../docs/adr/0001-tech-stack-choice.md) — **no new runtime dependency**. Pure ESM (Node ≥ 18); `zod` is **not** used for this feature (config parsing is hand-rolled), so the dependency set stays untouched; `@clack/prompts` reused for all prompts, `openai` SDK reused for the `chat-completions` transport. `npm audit` is not required for this spec because the dependency set does not change. [ADR-0002](../../docs/adr/0002-quality-gates.md) — every touched file passes `node --check`, `npm run lint` and the full `npm test` suite.
- **Architecture document:** respects [docs/architecture.md](../../docs/architecture.md). No new module boundary is invented beyond `src/api/transports/` in Stage B, which sits under the existing `api/` layer and is re-exported through `api/index.js`. `config.js` remains the single owner of credential state; `commands.js` owns prompts; `handlers.js` owns dispatch behavior; `index.js`/`registry.js` stay the pure dispatch/help layers.
- **Design system:** no new raw color calls. All new output goes through `C.*` from `src/ui/theme.js`; the wizard continues to use the `pc` → `C.*` re-map already declared at the top of `commands.js` so `/provider`, `/connect` and the new listing stay in one color system ([docs/visual-identity.md](../../docs/visual-identity.md)).

## 3. Security and Threat Model

| Element | Handling |
|----------|----------|
| Command execution and whitelist | **Not applicable.** The feature adds no `runCommand` call and no tool handler. It never touches the shell whitelist, `safeMode` or `dryRun`. |
| File writes and `resolveSafePath` | **Not applicable** in the `resolveSafePath` sense: the only write target is the fixed path `path.join(os.homedir(), '.emile', 'config.json')`, which is not user-supplied and is never workspace-relative, so `resolveSafePath` cannot be bypassed. Writes keep `{ mode: 0o600 }` plus best-effort `chmodSync(0o600)`. Directory creation stays `mkdirSync(..., { recursive: true })`. |
| LLM inputs (prompt injection / tool args) | The feature consumes **no** LLM output. All inputs are user-typed at the prompt: slug (kebab-case regex), base URL (`new URL` + protocol/host allow-list), format (three-value enum), label and model id (length-capped, CR/LF/tab stripped before display). Config read from disk is the other input and is normalized by the defensive load pipeline (no `zod`). |
| Secrets (API keys, sessions, exports) | Keys are written **only** to the `0600` config file and used **only** as the `Authorization` bearer for the active slot's own `baseURL`. They are never printed in full, never written to logs, sessions, exports or crash output; listings mask to at most the last 4 characters; `formatApiError()` keeps its `Bearer …` / `api_key=…` redaction. |
| Controls and negative tests | The four negative criteria below are mandatory and must reappear in `tasks.md` Phase 2 as explicit negative scenarios with evidence. |

**Mandatory negative acceptance criteria (from spec § 4.1):**

1. **Credentials never follow a redirect.** No API key may be transmitted to a host other than the one in the slot's `baseURL`; redirect-following must be disabled or the `Authorization` header stripped on any cross-origin hop.
2. **Keys are never printed, logged or included in error messages.** Masked listings may show **at most the last 4 characters** of a key; no full key may reach stdout, stderr, a session file, an export or diagnostics.
3. **`http://` is allowed only for `localhost` / `127.0.0.1`, enforced at write time *and* at client-build time.** A hand-edited config smuggling a remote `http://` URL must **fail closed at `getClient()`** with an actionable message and **no network call**.
4. **Per-provider key isolation.** Slot B's key must never resolve for slot A.

*High risk requires explicit analysis — see spec § 4 and [Code Quality and Security](../../docs/code-quality-and-security.md).*

## 4. Impacted Modules

| Module | Path | Change |
|--------|---------|--------|
| Config | `src/config.js` | v2 storage layer, hand-rolled defensive normalization, v1 migration, slot map, `resolveApiKey` isolation, `config` views, v2-only serializer, `isValidProviderURL`, per-slot `reasoningStyle` (RF-S13, AC-29) |
| API client (dispatcher) | `src/api/client.js` | 4-part composite cache key, custom base URL/format branch, fail-closed URL validation; in Stage B the **Stage A unsupported-format guard is removed** and the module becomes the format dispatcher (resolve slot definition → transport), keeping the exact `createChatCompletion` signature |
| Commands wizard | `src/commands.js` | Conditional `/connect` manager, custom-endpoint wizard, `/model` manual entry for custom slots, masked provider listing |
| Command handlers | `src/commands/handlers.js` | New `handleProvider` (ctx-injected select, switch, `resetClient`, title/config box, `initSessionStats` re-sync) |
| Command dispatch | `src/commands/index.js` | Register `/provider` |
| Command registry | `src/commands/registry.js` | `/provider` row for `/help` and autocomplete |
| Transport base (Stage B) | `src/api/transports/base.js` | Shared SSE event parser, streaming retry skeleton (existing inline notices), error-status / retryable / retry-delay helpers relocated from `client.js`, non-streaming chunk collector |
| Transport — `chat-completions` (Stage B) | `src/api/transports/chat-completions.js` | Existing SDK streaming path relocated verbatim, no logic rewrite |
| Transport — `anthropic-messages` (Stage B) | `src/api/transports/anthropic-messages.js` | Pure request builder + streaming generator for `/v1/messages` (Annex A.1) |
| Transport — `responses` (Stage B) | `src/api/transports/responses.js` | Pure request builder + streaming generator for `/responses` (Annex A.2) |
| Transport barrel (Stage B) | `src/api/transports/index.js` | Barrel mirroring `src/api/index.js`: one transport per format + shared base helpers |
| API barrel | `src/api/index.js` | Re-export transport selection helpers |

## 5. Impacted Flags / Slash Commands / Tools

| Type | Name | Change |
|------|------|--------|
| CLI flag | *(none)* | No new or changed flag |
| Slash command | `/connect` | Becomes a conditional credential manager: list-all, Keep / Update / Remove, custom endpoint creation (switching stays with `/provider`) |
| Slash command | `/provider` | **New** — two-keystroke active-provider switch with `lastModel` restore and context re-sync |
| Slash command | `/model` | Gains manual identifier entry + persistence for custom (non-gateway) providers |
| Tool | *(none)* | No tool handler change; the agent's stream-consumption contract is untouched |
| MCP | *(none)* | Not applicable |

## 6. Files to Create/Modify

| Action | Path (expected) | Notes |
|------|--------------------|---------------|
| Create | `test/provider-config.test.js` | Contract tests (a)–(e) from deep-dive §8.4 plus URL-validation and isolation cases |
| Create | `src/api/transports/base.js` | Stage B — shared SSE parser, retry skeleton, status/retry-delay helpers, non-streaming collector |
| Create | `src/api/transports/chat-completions.js` | Stage B — existing SDK streaming path relocated verbatim |
| Create | `src/api/transports/anthropic-messages.js` | Stage B — `/v1/messages` request builder + streaming generator |
| Create | `src/api/transports/responses.js` | Stage B — `/responses` request builder + streaming generator |
| Create | `src/api/transports/index.js` | Stage B — transport barrel |
| Create | `test/api-transports.test.js` | Stage B — contract + negative transport suite over in-test `node:http` loopback fixtures |
| Create | `features/provider-system.md` | Phase 3 (Rule 7) — **later stage** |
| Modify | `src/config.js` | v2 schema, migration, views, `isValidProviderURL`, per-slot `reasoningStyle` (cleanSlot allow-list, `saveUserConfig`, `slotView`, `getActiveProviderDef`) |
| Modify | `src/api/client.js` | Composite cache key, custom branch, fail-closed gate; Stage B dispatcher (guard removed, format routing, non-streaming aggregation) |
| Modify | `src/commands.js` | Conditional wizard, custom-endpoint wizard, `/model` custom branch, `/connect` custom `reasoningStyle` effort-parameter select (chat-completions only) |
| Modify | `src/commands/handlers.js` | `handleProvider` |
| Modify | `src/commands/index.js` | `/provider` dispatch entry |
| Modify | `src/commands/registry.js` | `/provider` help/autocomplete row |
| Modify | `src/api/index.js` | Transport re-exports via the new barrel (Stage B) |
| Modify | `docs/deep-dive.md`, `docs/architecture.md`, `README.md`, `CHANGELOG.md`, `features/README.md` | Phase 3 — Rule 2 / Rule 7 docs sync, **later stage** |

## 7. Technical Decisions (summary)

*Decisions made during planning that deserve a record.*

1. **`config` keeps `provider`/`apiKey`/`defaultModel` as views, not duplicated fields.** Single source of truth in the slot map; zero changes for the ~dozens of existing consumers. (Spec § 3 rule 10, AC-19.)
2. **Legacy fields are removed on the next save, not at load.** Keeps load side-effect free and makes migration observable exactly once (AC-04).
3. **Reserved gateway ids always resolve to `chat-completions` with hardcoded URLs.** Guarantees AC-18 / "byte-for-byte unchanged" without any per-request branching.
4. **`http://` gate lives in `isValidProviderURL`, called from both the write path and `getClient()`.** Write-time validation alone is not enough — a hand-edited file bypasses the wizard — so the check is repeated at client-build time and fails closed before any socket is opened (AC-16).
5. **The client cache key becomes a 4-part composite** rather than adding fields to the existing two, so a same-key/different-URL pair cannot reuse a stale client (AC-12).
6. **`/connect` never prompts for a password on an already-configured provider.** *Keep* is the default-first option; this is the actual pain being removed.
7. **Transports are normalized into the existing delta contract**, never a new one, so `agent.js` is untouched (spec § 5).
8. **Stage B is a separate phase** so Stage A can ship and be verified independently.
9. **Stage A dispatch contract: hand-rolled defensive parsing (no zod schema), Keep/Update/Remove manager, mutable views refreshed on switch — supersedes the deep-dive §8.4 sketch where they differ.**
10. **`buildReasoningParams` stays in `client.js`.** Its tests and the `reasoningStyle` branch live there, so moving it would produce a diff that is not reviewable and break the existing reasoning suites; only the retry/error helpers move to `base.js`, and `client.js` **re-exports them** so the public import surface is unchanged for existing consumers.
11. **Non-streaming on a fetch format is an aggregation of the same normalized chunks**, not a second code path: the collector in `base.js` folds the generator's output into an OpenAI-shaped response. `agent.js`, `compression.js` and `session-summary.js` are therefore untouched (AC-30, AC-32).
12. **The Anthropic thinking budget map is defined once**, inside the `anthropic-messages` transport, and reused by the `chat-completions` `thinking` reasoningStyle. Two copies of the budget clamps would drift (AC-29).
13. **`reasoningStyle` never overrides a gateway and never applies to the two `fetch` formats.** A reserved gateway id has no `reasoningStyle` field, and for `anthropic-messages` / `responses` the format fixes the reasoning parameter, so the setting is ignored rather than translated (spec § 3.1, AC-29).
14. **The style list covers the dialects found in the wild, at the user's request.** Beyond the originally planned keys, `effort` (top-level string) and `reasoningEffort` (camelCase) were added because some llama.cpp-style and corporate-proxy servers spell the parameter that way; the mapping is a pure body-key switch in `buildReasoningParams` — the effort VALUE vocabulary stays `min/low/medium/high/max` normalized exactly as the generic path does (`min→low`, `max→high`).

## 8. Verification Strategy and Gates

*Map each AC to positive, negative, boundary and regression checks.*

| Check type | Command | Covers |
|------------|---------|--------|
| Syntax | `node --check src/config.js`, `node --check src/api/client.js`, `node --check src/commands.js`, `node --check src/commands/handlers.js`, `node --check src/commands/index.js`, `node --check src/commands/registry.js` (+ each Stage B transport file) | all touched JS |
| Contract suite | `node --test test/provider-config.test.js` | AC-01..AC-08, AC-10..AC-12 (mechanical parts), AC-16, AC-17 (`resolveApiKey` part), AC-19 — including deep-dive 8.4 (a) key not erased, (b) `resolveApiKey` isolation, (c) migration + flat-field removal, (d) keyless `/provider` message with no stdin read, (e) `contextLimit` re-sync |
| Security / permissions suite | `node --test test/config-permissions.test.js` | AC-01 (`0600` mode, POSIX) |
| Lint | `npm run lint` | all touched files |
| Syntax (Stage B transports) | `node --check src/api/transports/base.js`, `node --check src/api/transports/chat-completions.js`, `node --check src/api/transports/anthropic-messages.js`, `node --check src/api/transports/responses.js` | all new transport files |
| Transport contract suite (Stage B) | `node --test test/api-transports.test.js` | AC-21..AC-25 (request shape, normalized chunks, stop-reason mapping) |
| Transport negative scenarios (Stage B) | The negative scenarios of **AC-26** (redirect refusal), **AC-27** (retry discipline) and **AC-28** (malformed SSE tolerance) run against **in-test `node:http` loopback fixtures**, so they are Windows-safe (no external port assumptions, no live endpoint) and hermetic — nothing leaves the test process | AC-26, AC-27, AC-28 |
| Gateway regression guard (Stage B) | `node --test test/api-client.test.js` and `node --test test/agent-reasoning-stream.test.js` are the **gateway regression guard**: the reserved gateway requests and the reasoning stream must stay byte-for-byte unchanged | AC-18, AC-32 |
| Regression | `npm test` (full `node --test test/*.test.js`) | AC-20 and no regressions in agent loop, compression, UI |
| Manual scripts | `node bin/emile.js --verbose` then `/connect` → `/provider` → `/model` for a gateway and a local `http://127.0.0.1` endpoint; `/connect` list-all masking; `curl`-verified 302 test for AC-14 | AC-07..AC-11, AC-13, AC-14, AC-15 |
| Dependency audit | Not applicable — no new dependency (ADR-0001); `npm audit` optional | — |

Negative scenarios executed manually and then encoded as tests: redirect with cross-origin `Authorization` (AC-14), remote `http://` smuggled into config (AC-16), cross-provider key resolution (AC-03/AC-17), full-key leakage in every listing/error/export path (AC-15).

## 9. Git Workflow

| Item | Answer |
|------|--------|
| **Working branch** | `development` — do not switch, create a feature branch or use a worktree unless the user explicitly asks (Rule 8 of `.clinerules`) |
| **Commit plan** | Commit coherent code/tests/docs units directly on `development`; stage only explicit paths (never `git add .` or `git add -A`) |

## 10. Failures, Partial State and Rollback

| Topic | Strategy |
|------|----------|
| Error handling and user-facing messages | All failures surface through the existing `formatApiError()` mapping or `C.*` console lines with actionable text (e.g. "Run `/connect <id>` to add a key for <provider>"). Never a raw stack trace, never a key. Invalid URL/format/slug is rejected inline in the prompt before any write. |
| Interruption (Ctrl+C / Esc) and readline state | Clack `isCancel()` at every prompt returns to the REPL cleanly with `cancel('...')`; the handler always calls `setTerminalActivity('waiting')` in a `finally` so the status activity never sticks on "switching provider". No partial prompt is left open. |
| Partial state (session, undo stack, file cache) | The config write is a single `writeFileSync` of a fully-built v2 document — no partial document. `resetClient()` is called immediately after a successful switch so the client cache can never hold a stale provider. `/provider` changes no session content, no undo stack entry and no model override beyond the active slot's `lastModel`. |
| Rollback / undo | Config rollback is manual and safe: the previous `~/.emile/config.json` is user-owned. Code rollback is a single `git revert` of the coherent commit (Rule 8 keeps commits atomic). A revert restores the v1-compatible loader only if the file was also reverted; a v2 file read by pre-feature code degrades to defaults with a warning, never a crash. |

## 11. Technical Risks and Trade-offs

| Risk | Likelihood | Mitigation |
|------|---------------|-----------|
| Composite cache key causes an extra client rebuild per turn if any part is unstable | Medium | All four parts derive from immutable slot state; verified by AC-12 and the regression suite. |
| Defensive parsing rejects a previously-accepted (looser) config and blocks startup | Medium | The load pipeline is tolerant: unknown/invalid **slots** and fields are dropped silently, custom slots without a non-empty `baseURL` are discarded, defaults are filled; only a wholly malformed document falls back to the default gateway view (today's behavior). Never a crash. |
| Custom endpoints widen the SSRF-ish surface (user-supplied URL + key) | High (inherent) | Dual gate (write time + `getClient()` fail-closed), https-only for remote, no redirect credential forwarding, explicit in § 4.1. Documented, not eliminated — the feature is user-directed. |
| Stage B transport adapters drift from the real provider SSE formats | Medium | The field-level wire detail is pinned normatively in spec §9 Annex A and each adapter normalizes into the existing delta contract; agent tests stay untouched by design and the contract suite asserts against loopback fixtures. |
| Docs drift while Stage B is unimplemented | Medium | Phase 3 tasks are explicitly unchecked until the transports land, so `/provider` docs are not advertised as supporting formats they cannot yet serve. |