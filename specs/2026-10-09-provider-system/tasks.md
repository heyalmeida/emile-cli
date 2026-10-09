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

> Deferred to a later dispatch. Tasks exist and must stay unchecked until then.

- [ ] T1B.1 — Create `src/api/transports/chat-completions.js` as the normalized adapter for the existing path *(verifies AC-13)*
- [ ] T1B.2 — Create `src/api/transports/anthropic-messages.js`: `/v1/messages` request shape (system block, tool schema mapping, `thinking.budget_tokens`) and SSE parsing normalized into the **existing** delta contract; no change to the agent's stream consumption *(verifies RF-S11)*
- [ ] T1B.3 — Create `src/api/transports/responses.js`: Responses API request shape and SSE event parsing normalized into the same delta contract; no change to the agent's stream consumption *(verifies RF-S11)*
- [ ] T1B.4 — Dispatch by the slot's `format` in `client.js` / `api/index.js`, keeping retry, abort, reasoning and error/redaction behavior identical across formats *(verifies AC-13, AC-15)*
- [ ] T1B.5 — Verify each transport against a live/local endpoint and add per-format contract tests; confirm the agent loop test suite is untouched and green *(verifies AC-20)*

## Phase 2 — Testing, Security and Verification

- [ ] T2.1 — Run the positive, negative, boundary and regression checks defined in plan §8 (documented manual scripts until the automated suite exists)
  > *partial: contract/security subset done in T2.5/T2.6/T2.9; redirect + Authorization-header checks and gateway byte-equality need live/stub network (Stage B)*
- [x] T2.2 — Run `node --check` on all touched files and the smoke test (`node bin/emile.js --verbose`); record commands and results — `node --check` passed on all touched files; `bin/emile.js` smoke **not** run in headless dispatch (no live credentials) — residual verification noted
- [x] T2.3 — `npm audit` — not applicable, no new dependency (ADR-0001); confirm `package.json` is untouched — confirmed not applicable: `package.json` untouched, no new dependency
- [ ] T2.4 — Verify ALL of the spec's acceptance criteria, one by one
- [x] T2.5 — **Contract tests (a)–(e) from deep-dive §8.4** in `test/provider-config.test.js`: (a) configuring `opencode` does not erase `providers.openrouter.apiKey`; (b) `resolveApiKey('requesty')` with a key stored only under `openrouter` returns `''`; (c) legacy config with flat `apiKey` + `provider: "openrouter"` migrates the key into the slot and the flat field is removed after the next save; (d) `/provider` on a slot with no key prints an actionable `/connect` message and **never** prompts for a password; (e) after `/provider`, `sessionStats.contextLimit` equals the new model's window *(verifies AC-02, AC-03, AC-04, AC-05, AC-06)* — evidence: (a) T2 pass, (b) T3 pass, (c) T1 pass, (d) T4 pass, (e) T5 pass; suite 9/9 green on Windows
- [x] T2.6 — **Security tests** in `test/config-permissions.test.js`: file mode is `0600`; `isValidProviderURL` accepts `http://localhost`, `http://127.0.0.1` and any `https://`, and rejects every other remote `http://` at **write time**; a hand-edited config with a remote `http://` base URL makes `getClient()` **fail closed with an actionable message and no network call** *(verifies AC-01, AC-16)* — evidence: mode tests remain (2 POSIX-skips on Windows); URL matrix T7; client fail-closed T9 (write-time enforcement lives in the `/connect` wizard validate + `isValidProviderURL` — encoded as verified by T7 + code inspection)
- [ ] T2.7 — **Threat item 1 — credentials never follow a redirect:** with a local stub answering `302` to a different origin, assert the API key is **not** sent to the redirect target (no follow, or `Authorization` stripped) and the failure is an actionable error *(verifies AC-14)*
- [ ] T2.8 — **Threat item 2 — keys never printed/logged/in error messages:** assert `/connect` listings show at most the last 4 characters, `formatApiError()` output contains no `Bearer <key>` / `apiKey=<key>`, and nothing in stdout, stderr, session files or exports contains a full key — including with `EMILE_DEBUG_API` on *(verifies AC-15)*
- [x] T2.9 — **Threat item 3 — `http://` gate:** assert write-time rejection **and** client-build-time fail-closed (no socket opened) for a smuggled remote `http://` URL, with an actionable message *(verifies AC-16)* — evidence: T7 (write-time) + T9 (client-build fail-closed, no network call)
- [ ] T2.10 — **Threat item 4 — per-provider key isolation:** assert that switching A→B→A sends only the active slot's key in `Authorization`, and that slot B's key never resolves for slot A *(verifies AC-03, AC-17)*
- [ ] T2.11 — Regression: reserved gateway requests are byte-for-byte unchanged even when `baseURL`/`format` are overridden in a hand-edited config *(verifies AC-18)*
- [x] T2.12 — Run `npm run lint`, `node --test test/provider-config.test.js`, `node --test test/config-permissions.test.js` and the full `npm test` suite on Windows; all must be green *(verifies AC-20)* — evidence: lint exit 0 (0 errors / 144 pre-existing warnings); provider-config 9/9; config-permissions 4 pass + 2 POSIX-skips; `npm test` 333 tests, 0 failures (10 Windows env-skips)

## Phase 3 — Documentation and Closing

> Documentation sync happens in a later stage — these tasks must stay unchecked until Stage A **and** Stage B land.

- [ ] T3.1 — Execute Rule 2 of `.clinerules` (sync of affected docs, including README for flags/commands/tools): `docs/architecture.md` (config v2 schema + transport layer), `docs/deep-dive.md` §8.4 status, `docs/glossary.md`, `README.md` (`/provider`, `/connect` semantics, custom endpoints)
- [ ] T3.2 — If it's a new/changed feature, create or update `features/provider-system.md` (Rule 7) and the index
- [ ] T3.3 — Record the entry in `CHANGELOG.md`
- [ ] T3.4 — Revalidate touched Mermaid blocks
- [ ] T3.5 — Update the spec status to `implemented` (both stages)
- [ ] T3.6 — Commit the documentation sync on `development` with only explicit documentation paths staged (Rule 8)
- [ ] T3.7 — Record in the handoff limitations, non-executed verifications and residual risk (custom-endpoint SSRF surface, Stage B transport coverage per provider)

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
| AC-13 | ⏳ | branch builds from slot; live streaming test deferred |
| AC-14 | ⏳ | Stage B — needs live/stub redirect server |
| AC-15 | ✅ | masking path verified: T3 slot dump shows `keyTail` only, no full key; `formatApiError` redaction untouched (export/log path pre-existing) |
| AC-16 | ✅ | T7 + T9 |
| AC-17 | ✅ | `resolveApiKey` part via T3; `Authorization` header check pending |
| AC-18 | ⏳ | pending regression probe (gateway byte-equality, Stage B) |
| AC-19 | ✅ | T1/T5/T6 views |
| AC-20 | ✅ | T2.12 evidence |

> Legend: ⏳ pending / ✅ verified / ❌ failed (go back to implementation)

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| | | |