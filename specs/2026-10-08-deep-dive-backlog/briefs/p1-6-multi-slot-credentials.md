# BRIEF P1-6 — Multi-slot provider credentials + `/connect` sync + `/provider` switcher

> Read first: `specs/2026-10-08-deep-dive-backlog/_shared-constraints.md` and `docs/deep-dive.md` § 8.4. This brief delivers the "switch provider without re-entering the API key" experience.

## Goal

Credentials are a single slot: `saveUserConfig()` persists a flat `apiKey` (`src/config.js:142-149`) and `resolveApiKey()` only returns it when `savedConfig.provider === provider` (`config.js:81-90`). Consequence: after configuring provider B, switching back to provider A demands re-typing A's key. Store one credential slot PER provider and add explicit switching.

## Current behavior (facts)

- Flat storage: `saveUserConfig()` (`config.js:127-161`) writes `{ provider, apiKey, model, effort, webSearch, maxLoopIterations }` to `~/.emile/config.json`, `mode: 0600` (`:157`, chmod best-effort `:154-156`).
- Resolution: `resolveApiKey(provider)` (`config.js:81-90`) — saved key only if `savedConfig.provider === provider`, else `ENV_KEY_MAP[provider]` (`config.js:65-70`; `opencode` and `opencode-go` share `OPENCODE_API_KEY`), else `''`. Cross-provider silent fallback was deliberately REMOVED (IMPROVEMENTS §1.4) — do not resurrect it as a silent path.
- `config.apiKey` is resolved once at module load (`config.js:94`); `hasCredentials()` (`config.js:167-169`) checks it.
- Wizards live in `src/commands.js` (`runConnectWizard`, `runModelWizard`, imported at `src/cli.js:60`); slash commands register in `src/commands/registry.js` with handlers in `src/commands/handlers.js`.
- The API client reads provider at request time via the baseURL branch (`src/api/client.js:30-68`) — VERIFY whether the client caches the provider/baseURL at module init or per call; if cached, add a re-init hook so `/provider` takes effect on the next turn without restart.

## Required design

1. **New persisted shape** in `~/.emile/config.json`:

```json
{
  "provider": "requesty",
  "apiKey": "<active key, kept for backward compat>",
  "model": "<active model>",
  "providers": {
    "requesty":    { "apiKey": "…", "lastModel": "…" },
    "openrouter":  { "apiKey": "…", "lastModel": "…" },
    "opencode":    { "apiKey": "…", "lastModel": "…" },
    "opencode-go": { "apiKey": "…", "lastModel": "…" }
  }
}
```

The top-level `provider/apiKey/model` stay written on every save (they are the ACTIVE alias; older emile versions must keep working). The new `providers` map is the credential vault. File mode stays `0600` (`config.js:157`).

2. **Load + migration** (`config.js` module init): read `savedConfig.providers` if present; else if legacy flat `apiKey` + `provider` exist, seed `providers[<that provider>] = { apiKey, lastModel: savedConfig.model }`. Env keys are never copied into the file.
3. **`resolveApiKey(provider)`** (`config.js:81-90`) precedence becomes: `providers[provider].apiKey` → legacy flat key (only when `savedConfig.provider === provider`, preserving today's semantics) → `ENV_KEY_MAP[provider]` env var → `''`. Keep `hasCredentials()` meaning "the ACTIVE provider has a key".
4. **`/connect [provider]`** (existing wizard, `src/commands.js`): gains an optional provider argument and a picker when omitted (the 4 gateways). It now does BOTH jobs: stores the key into that provider's slot AND activates the provider (sets `config.provider`, `config.apiKey`, persists both). This is the "sync" behavior: running `/connect` for each provider once fills the vault; later switches never ask for keys again.
5. **New `/provider [name]`** command: registry entry + handler. Without argument: picker listing the 4 gateways with per-slot status (saved key: yes/no; env var available: yes/no; `lastModel` shown when present). Selecting a provider:
   - if the slot has a key (file or env): switch immediately — `config.provider`, `config.apiKey`, `config.defaultModel = providers[slot].lastModel || current default`; persist via `saveUserConfig`; confirm with a one-line message (masked key never shown).
   - if no key: offer inline "connect now?" → same flow as `/connect <name>`.
   Switching is an explicit user action — it does NOT weaken the no-cross-provider-fallback rule.
6. **`lastModel` bookkeeping**: wherever the model is changed for the active provider (model wizard `runModelWizard`, `/model` handler), also write `providers[<active>].lastModel` so switching back restores that provider's last used model.
7. **Masking/display**: any status display shows slot presence, never key content (follow the existing pattern — credentials are never shown in prompts or warnings, architecture.md:48 invariant).

## Tests to add (`test/multi-slot-credentials.test.js`)

- Migration: legacy flat `{provider, apiKey, model}` file → first `saveUserConfig` produces a `providers` map seeded with that key; subsequent loads resolve it.
- `resolveApiKey` precedence: slot key beats legacy flat; legacy flat only for the matching provider; env var used when slot empty.
- `/provider` switch (drive the handler with a stubbed picker): active provider + apiKey + defaultModel change and persist; next `resolveApiKey` returns the new slot's key.
- Shared env: `opencode` and `opencode-go` both fall back to `OPENCODE_API_KEY` when their slots are empty.
- Secrets never appear in any handler output (assert masked form only).

## Constraints

- Security gates never regress: keys stay out of logs, `mode: 0600` preserved, no key material in error messages (mask on any failure path).
- No new dependencies; wizard UI via `@clack/prompts` as today.
- `/provider` switching must be safe MID-SESSION: no in-flight turn (check the REPL's turn state / `isShuttingDown()`-style guard); if a turn is running, reply "finish the current turn first".
- Do not change `ENV_KEY_MAP` semantics or resurrect cross-provider fallback.

## Verification

`node --check src/config.js src/commands.js && node --test test/multi-slot-credentials.test.js && npm run lint && npm test`

## Docs sync (Rule 2)

- CHANGELOG `[Unreleased]` → Added: per-provider credential slots, `/connect <provider>` sync, `/provider` switcher (no key re-entry).
- `README.md` providers section: document `/provider` in one short paragraph.
- `docs/architecture.md` § 2 config.js row: mention the `providers` vault (mode 0600) and active-slot semantics.
- `docs/deep-dive.md` § 8.4: mark applied.
- features/: add the `/provider` feature file per Rule 7.
