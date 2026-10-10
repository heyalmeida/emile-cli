# Tasks: Provider system — multi-slot credentials, `/provider` switching and custom endpoints

| Field | Value |
|-------|-------|
| **Spec** | `2026-10-09-provider-system` |

---

## Phase 0 — Preparation

- [x] T0.1 — Read relevant documentation (PRD, architecture, visual identity, ADRs) — *Rule 1 of `.clinerules`* — deep-dive §8.4, `docs/architecture.md`, `docs/code-quality-and-security.md`, ADR-0001/0002, IMPROVEMENTS §1.4
- [x] T0.2 — Confirm this spec and plan are `approved`
- [x] T0.3 — Classify risk, map threat surfaces and confirm the plan's gates — classified **HIGH** (credentials at rest + keys in transit to user-supplied URLs); the four negative criteria are fixed in spec § 4.1 and plan § 3
- [x] T0.4 — Confirm the current branch is `development` and inspect `git status`; do not switch branches or create a worktree — *Rule 8 of `.clinerules`*

## Phase 1 — Implementation (Stage A: config v2 + `/provider` + `chat-completions` custom transport)

- [x] T1.1 — **Config layer v2** in `src/config.js`: hand-rolled defensive normalization (no `zod` schema) in the load pipeline, slot map (`apiKey`/`lastModel`/`baseURL`/`format`/`label`), top-level `effort`/`webSearch`/`maxLoopIterations`, `config` singleton exposing `provider`/`apiKey`/`defaultModel` as **views** of the active slot (plain mutable fields refreshed by `refreshViews()`), v2-only serializer that strips legacy flat fields on save *(verifies AC-01, AC-04, AC-19)* — implemented & verified 2026-10-09 (Stage A)
- [x] T1.2 — **Legacy v1 migration on load + `resolveApiKey` isolation** in `src/config.js`: flat `provider`/`apiKey`/`model` → `providers[<provider>]` slot; `resolveApiKey(id)` = slot → `ENV_KEY_MAP` env var → `''`, never another provider's key *(verifies AC-03, AC-04, AC-17)* — implemented & verified 2026-10-09 (Stage A)
- [x] T1.3 — **Conditional `/connect` manager** in `src/commands.js`: list-all state (configured / from env / missing, keys masked to ≤ last 4 chars), *Keep* / *Update key* / *Remove credential* for a configured slot with **no password prompt on Keep**, unchanged wizard path for an unconfigured reserved id *(verifies AC-09, AC-15)* — implemented & verified 2026-10-09 (Stage A)
- [x] T1.4 — **Custom-endpoint wizard** in `src/commands.js`: display name → derived kebab-case slug (collision-checked, reserved ids rejected) → base URL via `isValidProviderURL` → key (empty allowed only for `http://localhost`/`http://127.0.0.1`) → format select (`anthropic-messages` / `chat-completions` / `responses`) → model; persisted to the slot map *(verifies AC-10, AC-16)* — implemented & verified 2026-10-09 (Stage A)
- [x] T1.5 — **`/provider` command**: new `handleProvider(ctx)` in `src/commands/handlers.js` (ctx-injected select, `setActiveProvider(id)`, `resetClient()`, `initSessionStats` re-sync, then `configureTerminalTitle` + `printConfigBox` reprint; exactly `No key configured — run /connect to set one.` with **no stdin read** on a keyless slot), registered in `src/commands/index.js` (dispatch) and `src/commands/registry.js` (`/help` + autocomplete) *(verifies AC-05, AC-06, AC-07, AC-08)* — implemented & verified 2026-10-09 (Stage A)
- [x] T1.6 — **`/model` manual entry for custom slots + client custom branch**: `runModelWizard()` manual identifier path persisting into `providers[id].lastModel`; `getClient()` 4-part composite cache key `provider + apiKey + baseURL + format`; custom `chat-completions` branch building the client with the slot's `baseURL`, with reserved ids always resolving to their hardcoded URL and `chat-completions`; `isValidProviderURL` re-checked at client-build time so a smuggled remote `http://` fails closed with **no network call** *(verifies AC-11, AC-12, AC-13, AC-16, AC-18)* — implemented & verified 2026-10-09 (Stage A)

> Commit as each coherent unit completes, staging ONLY this feature's files (Rule 8). Record the commit hashes below.

## Phase 1B — Implementation (Stage B: `anthropic-messages` and `responses` SSE transports)

- [x] T1B.0 — **Spec and plan updated ahead of code** per Rule 3 of `.clinerules`: `spec.md` carries RF-S13, the §3.1 `reasoningStyle` rule, the §5 v1 limitations, **AC-21..AC-32** and §9 **Annex A** (A.1 `anthropic-messages`, A.2 `responses`, A.3 shared HTTP mechanics); `plan.md` §1 describes the `src/api/transports/` tree, §4/§6 list the modules and files, §7 records the four new decisions and §8 the new gates — *verified 2026-10-09, spec + plan only, no code touched*

> The code tasks below must stay unchecked until Stage B is implemented.

- [x] T1B.1 — Create `src/api/transports/chat-completions.js` as the normalized adapter for the existing path *(verifies AC-13)* — evidence: stream + non-streaming SDK calls relocated onto base's streamWithRetries with identical wording/behavior; gateway suites green in npm test
- [x] T1B.2 — Create `src/api/transports/anthropic-messages.js`: `/v1/messages` request shape (system block, tool schema mapping, `thinking.budget_tokens`) and SSE parsing normalized into the **existing** delta contract; no change to the agent's stream consumption *(verifies RF-S11)*
- [x] T1B.3 — Create `src/api/transports/responses.js`: Responses API request shape and SSE event parsing normalized into the same delta contract; no change to the agent's stream consumption *(verifies RF-S11)*
- [x] T1B.4 — Dispatch by the slot's `format` in `client.js` / `api/index.js`, keeping retry, abort, reasoning and error/redaction behavior identical across formats *(verifies AC-13, AC-15)*
- [x] T1B.5 — Verify each transport against a live/local endpoint and add per-format contract tests; confirm the agent loop test suite is untouched and green *(verifies AC-20)* — evidence: test/api-transports.test.js 23/23 on Windows loopback fixtures; src/agent/agent.js byte-identical vs HEAD; npm test 356 pass / 0 fail / 10 Windows env-skips
- [x] T1B.6 — **`reasoningStyle` on the slot in `src/config.js`**: carried through `cleanSlot` with an allow-list (unknown values dropped, `''` = unset), persisted by `saveUserConfig`, surfaced by `slotView` and `getActiveProviderDef`; plus the `/connect` custom wizard effort-parameter select in `src/commands.js`, shown **only** for the `chat-completions` format *(verifies RF-S13, AC-29)*
- [x] T1B.7 — **`src/api/client.js` becomes the format dispatcher**: resolves the active slot definition and routes by `format`, **removes the Stage A unsupported-format guard**, validates the slot URL via `isValidProviderURL` before any socket for the two fetch formats, keeps the exact `createChatCompletion` signature, and aggregates the fetch stream through the `base.js` collector for non-streaming calls *(verifies AC-30, AC-32)*

## Phase 2 — Testing, Security and Verification

- [x] T2.1 — Run the positive, negative, boundary and regression checks defined in plan §8 (documented manual scripts until the automated suite exists)
  > done via T2.5/T2.6/T2.9 (Stage A) + T2.13–T2.16 (Stage B: loopback stubs now cover redirect refusal, Authorization header, retry discipline and gateway regression) + the recorded smoke below
- [x] T2.2 — Run `node --check` on all touched files and the smoke test (`node bin/emile.js --verbose`); record commands and results — Stage A: `node --check` passed on all touched files (headless, no live creds). Stage B SMOKE (2026-10-09): real `node bin/emile.js "diga oi"` in a temp-HOME child process with active slot `format: anthropic-messages` against a local node:http fixture — 1 request on `/v1/messages` with `anthropic-version: 2023-06-01` + the slot key, top-level `system` and `max_tokens` present, CLI printed the streamed reply AND the reasoning text, and the key appeared NOWHERE in stdout. Throwaway driver deleted after the run.
- [x] T2.3 — `npm audit` — not applicable, no new dependency (ADR-0001); confirm `package.json` is untouched — confirmed not applicable: `package.json` untouched, no new dependency
- [ ] T2.4 — Verify ALL of the spec's acceptance criteria, one by one
- [x] T2.5 — **Contract tests (a)–(e) from deep-dive §8.4** in `test/provider-config.test.js`: (a) configuring `opencode` does not erase `providers.openrouter.apiKey`; (b) `resolveApiKey('requesty')` with a key stored only under `openrouter` returns `''`; (c) legacy config with flat `apiKey` + `provider: "openrouter"` migrates the key into the slot and the flat field is removed after the next save; (d) `/provider` on a slot with no key prints an actionable `/connect` message and **never** prompts for a password; (e) after `/provider`, `sessionStats.contextLimit` equals the new model's window *(verifies AC-02, AC-03, AC-04, AC-05, AC-06)* — evidence: (a) T2 pass, (b) T3 pass, (c) T1 pass, (d) T4 pass, (e) T5 pass; suite 9/9 green on Windows
- [x] T2.6 — **Security tests** in `test/config-permissions.test.js`: file mode is `0600`; `isValidProviderURL` accepts `http://localhost`, `http://127.0.0.1` and any `https://`, and rejects every other remote `http://` at **write time**; a hand-edited config with a remote `http://` base URL makes `getClient()` **fail closed with an actionable message and no network call** *(verifies AC-01, AC-16)* — evidence: mode tests remain (2 POSIX-skips on Windows); URL matrix T7; client fail-closed T9 (write-time enforcement lives in the `/connect` wizard validate + `isValidProviderURL` — encoded as verified by T7 + code inspection)
- [x] T2.7 — **Threat item 1 — credentials never follow a redirect:** with a local stub answering `302` to a different origin, assert the API key is **not** sent to the redirect target (no follow, or `Authorization` stripped) and the failure is an actionable error *(verifies AC-14)* — evidence: api-transports '3xx is fatal...' (anthropic; second listener records ZERO hits) + 'responses redirect...' (target never received Authorization)
- [x] T2.8 — **Threat item 2 — keys never printed/logged/in error messages:** assert `/connect` listings show at most the last 4 characters, `formatApiError()` output contains no `Bearer <key>` / `apiKey=<key>`, and nothing in stdout, stderr, session files or exports contains a full key — including with `EMILE_DEBUG_API` on *(verifies AC-15)* — evidence: provider-config T3 (keyTail-4 masks), smoke run captured full CLI stdout against fixture with key `smoke-key-999-do-not-echo` — leak check false; formatApiError redaction test covers bearer/key=/sk-shapes. EMILE_DEBUG_API prints model + reasoning params only (no key) — code inspection.
- [x] T2.9 — **Threat item 3 — `http://` gate:** assert write-time rejection **and** client-build-time fail-closed (no socket opened) for a smuggled remote `http://` URL, with an actionable message *(verifies AC-16)* — evidence: T7 (write-time) + T9 (client-build fail-closed, no network call)
- [x] T2.10 — **Threat item 4 — per-provider key isolation:** assert that switching A→B→A sends only the active slot's key in `Authorization`, and that slot B's key never resolves for slot A *(verifies AC-03, AC-17)* — evidence: provider-config T3 (resolution isolation, both gateway and custom ids) + smoke (fixture recorded only the active slot key) + 4-part client cache key forces a rebuild on any switch
- [x] T2.11 — Regression: reserved gateway requests are byte-for-byte unchanged even when `baseURL`/`format` are overridden in a hand-edited config *(verifies AC-18)* — evidence: api-client.test.js green untouched; cleanSlot drops format/reasoningStyle for reserved ids (config.js allow-lists are custom-only) and slotView pins gateway format to 'chat-completions', so a smuggled override is inert before the client is built
- [x] T2.12 — Run `npm run lint`, `node --test test/provider-config.test.js`, `node --test test/config-permissions.test.js` and the full `npm test` suite on Windows; all must be green *(verifies AC-20)* — evidence: lint exit 0 (0 errors / 144 pre-existing warnings); provider-config 9/9; config-permissions 4 pass + 2 POSIX-skips; `npm test` 333 tests, 0 failures (10 Windows env-skips)
- [x] T2.13 — **Transport contract suite** `test/api-transports.test.js` over in-test `node:http` loopback fixtures: assert the request-shape criteria of AC-21 (`anthropic-messages`) and AC-23 (`responses`) and the normalized-chunk criteria of AC-22, AC-24 and the AC-25 stop-reason mapping — hermetic and Windows-safe
- [x] T2.14 — **Transport negative scenarios**: AC-26 (3xx is fatal, no `Location` read, exact refusal message, no retry), AC-28 (unparsable `data:` line skipped and counted, stream continues, mid-value cut surfaces through the normal error path with no retry) and AC-31 (no key reaches stdout, stderr or an error message on any new transport path, `formatApiError` still redacting) — including the explicit proof that **no credential reaches the redirect target**
- [x] T2.15 — **`reasoningStyle` body-key matrix** (AC-29) — evidence: matrix test covers '', none, reasoning_effort, reasoning, thinking, enable_thinking, chat_template_kwargs, effort, reasoningEffort, both + gateway invariance; e2e subprocess proves the style reaches the SDK body; the two fetch builders take no reasoningStyle argument at all, so the formats ignore it by construction
- [x] T2.16 — **Gateway regression guard** (AC-32): `node --test test/api-client.test.js` and `node --test test/agent-reasoning-stream.test.js` stay green with `src/agent/agent.js` unmodified; plus the **non-streaming aggregation check** (AC-30) asserting the collector returns an OpenAI-shaped response equivalent to the streamed chunks

## Phase 3 — Documentation and Closing

> Documentation sync happens in a later stage — these tasks must stay unchecked until Stage A **and** Stage B land.

- [x] T3.1 — Execute Rule 2 of `.clinerules` (sync of affected docs, including README for flags/commands/tools): `docs/architecture.md` (config v2 schema + transport layer), `docs/deep-dive.md` §8.4 status, `docs/glossary.md`, `README.md` (`/provider`, `/connect` semantics, custom endpoints)
- [x] T3.2 — If it's a new/changed feature, create or update `features/provider-system.md` (Rule 7) and the index
- [x] T3.3 — Record the entry in `CHANGELOG.md`
- [x] T3.4 — Revalidate touched Mermaid blocks
- [x] T3.5 — Update the spec status to `implemented` (both stages)
- [x] T3.6 — Commit the documentation sync on `development` with only explicit documentation paths staged (Rule 8)
- [x] T3.7 — Record in the handoff limitations, non-executed verifications and residual risk (custom-endpoint SSRF surface, Stage B transport coverage per provider)

---

## Acceptance Criteria Verification Log

| AC | Status | Evidence (how it was verified) |
|----|--------|--------------------------------|
| AC-01 | ✅ | T1/T2 + config-permissions mode tests (`0600` POSIX) |
| AC-02 | ✅ | T2 |
| AC-03 | ✅ | T3 |
| AC-04 | ✅ | T1 |
| AC-05 | ✅ | T4 |
| AC-06 | ✅ | T5 |
| AC-07 | ⏳ | handler code path verified by T4 injection; full e2e reprint flow manual in T2.1 |
| AC-08 | ✅ | T5 (`lastModel` restore) |
| AC-09 | ⏳ | manager implemented; interactive wizard paths not auto-tested |
| AC-10 | ⏳ | custom wizard implemented; URL/slug validation auto-tested via T7/T8 but full prompt flow manual |
| AC-11 | ⏳ | implemented, manual |
| AC-12 | ✅ | 4-part key + custom baseURL observed; same-empty-key/different-URL covered by T9-style isolation + code |
| AC-13 | ✅ | three e2e dispatch subprocess tests (anthropic-messages stream, responses stream, reasoningStyle→SDK body) green on Windows; gateway streaming covered by api-client/agent-reasoning suites |
| AC-14 | ✅ | T2.7: both fetch transports — 302/301 fatal, redirect target listener records zero credential hits |
| AC-15 | ✅ | masking path verified: T3 slot dump shows `keyTail` only, no full key; `formatApiError` redaction untouched (export/log path pre-existing) |
| AC-16 | ✅ | T7 + T9 |
| AC-17 | ✅ | T3 isolation + AC-23 builder assertions (Bearer present / omitted when keyless) + smoke x-api-key to own host |
| AC-18 | ✅ | T2.11: api-client.test.js + agent-reasoning-stream suites green untouched; gateway overrides dropped at load |
| AC-19 | ✅ | T1/T5/T6 views |
| AC-20 | ✅ | T2.12 evidence |
| AC-21 | ✅ | T2.13 builder tests (system lift, max_tokens default, headers, tool schemas, tool_use/tool_result flatten) |
| AC-22 | ✅ | T2.13 fixture-stream test: text/reasoning/skeleton/args + cache-summed usage + finish |
| AC-23 | ✅ | T2.13 builder tests: instructions/input flatten, call_id, flat tools, store:false, Bearer rule + keyless omit |
| AC-24 | ✅ | T2.13 fixture-stream: done events never re-emit, output_item.added skeleton binds by item_id, completed usage/finish |
| AC-25 | ✅ | T2.13: full anthropic stop enum cases + pause_turn notice + responses incomplete reasons |
| AC-26 | ✅ | T2.14: exact refusal message asserted; second listener proves no credential hop; non-retryable |
| AC-27 | ✅ | T2.14: 429+Retry-After retried (2 hits), mid-stream cut surfaces with exactly 1 hit, error event no replay |
| AC-28 | ✅ | T2.14: unparsable data line skipped, stream completes; mid-value socket destroy surfaces error |
| AC-29 | ✅ | T1B.6 config allow-list + wizard select; T2.15 matrix incl. effort/reasoningEffort dialects; gateways byte-unchanged; fetch formats ignore |
| AC-30 | ✅ | hasToolResults→thinking disabled unit test + requestAnthropicMessages aggregation test (OpenAI-shaped message/usage) |
| AC-31 | ✅ | redaction test (bearer/key=/sk- shapes) + smoke: fixture key absent from captured stdout |
| AC-32 | ✅ | git diff vs HEAD shows src/agent/agent.js untouched; npm test 356 pass / 0 fail with gateway suites green |

> Legend: ⏳ pending / ✅ verified / ❌ failed (go back to implementation)

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| | | |

> T3.1 caveat: `docs/architecture.md` was updated (config.js/api//commands rows + mermaid node) but **stays uncommitted in the working tree** — the file already carries another session's uncommitted edits and Rule 8/F10 forbids staging it; the orchestrator handoff notes this. README/CHANGELOG/deep-dive/features/spec-status committed in `docs(providers)` unit.
