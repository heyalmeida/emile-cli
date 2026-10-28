# BRIEF P1-10 — Redact secrets at the tool-result boundary (context + session JSON)

> Read first: `specs/2026-10-08-deep-dive-backlog/_shared-constraints.md` and `docs/deep-dive.md` § 22.3 (secrets row), § 12.

## Goal

A tool result (`cat .env`, a build log echoing a token, a `curl` verbose dump) enters the model context and the persisted session JSON completely raw: `agent.js:713-717` pushes `toolResult.persistContent || toolResult.content` with no redaction pass. grok-build redacts at every out-of-band boundary (`grok: xai-grok-secrets/src/sanitizer.rs:5-108` — 10 ordered passes) and relies on the OS sandbox for the rest; emile has no sandbox, so **result-side redaction is its substitute**. The repo already contains the pattern arsenal in `src/memory/privacy.js:3-25` (AKIA, JWT `eyJ…`, PEM, `sk-`/`gh`/`glpat`/`xox`, `key=value` assignments) — currently used only to gate memory writes.

## Required design (do not re-derive; implement this)

1. New module `src/secrets.js`:
   - `redactSecrets(text)` → string. Reuse/extend the `privacy.js` patterns (import from it or move the shared list there — one source of truth, no duplicated regexes): AWS `AKIA…`, GitHub `gh[opusr]_`/`github_pat_`, GitLab `glpat-`, Slack `xox…`, OpenAI-style `sk-…`, bare JWT, PEM blocks, and `(?i)(api[-_ ]?key|token|secret|password)\s*[:=]\s*\S+` with an 8-char floor to limit false positives (grok's rule). Replace with `[redacted]`-style markers that keep shape (`sk-[redacted]`).
   - Deterministic and idempotent (redacting twice changes nothing).
2. Apply at the ONE chokepoint: when building the tool message in `agent.js` (`:713-717`), wrap the content: `content: redactSecrets(toolResult.persistContent || toolResult.content)`. Do NOT redact `transientMemoryToolContent` (memory privacy gate already denies secrets upstream — verify and note in the report).
3. `formatApiError` keeps its existing redaction (`client.js:153-159`) — do not touch.
4. MCP tool results flow through the same `agent.js` push path — covered automatically; verify in the report.

## Tests to add (new file `test/secrets-redact.test.js`)

- Unit: each pattern class redacts (fixture strings are FAKE sentinels — never real-looking secrets: `AKIAFAKEFAKEFAKE1234`, `ghp_FAKE…`, a syntactically-valid fake JWT, a PEM header line, `api_key: fakevalue123`); non-secret text with `task-`, `risk-`, `token` used as a plain word is UNCHANGED (false-positive guards, mirroring grok's tests).
- Idempotency: `redactSecrets(redactSecrets(x)) === redactSecrets(x)`.
- Integration: fake `createCompletion` returning a `readFile`-style tool result containing a sentinel; run one `runAgent` turn with a stubbed handler (pattern: existing agent tests) and assert the persisted `messages` tool content has the marker and not the sentinel.

## Constraints

- Redaction is content-preserving for non-secrets — never truncate or reformat otherwise.
- Do not add a config toggle to disable it (shared constraints #1: never weaken a security gate).
- No new dependencies.

## Verification

`node --check src/secrets.js src/agent/agent.js && node --test test/secrets-redact.test.js && npm run lint && npm test`

## Docs sync (Rule 2)

- CHANGELOG `[Unreleased]` → Added: secret redaction on tool results (context + session persistence boundary).
- `docs/code-quality-and-security.md`: new boundary row; `docs/deep-dive.md` § 12 + § 22.3: mark applied.
- `features/built-in-tools.md` or a `features/` row per Rule 7 (choose: it documents the tool pipeline — add a Change History row).
