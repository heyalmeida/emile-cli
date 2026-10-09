# Shared constraints — apply to every brief in this pack

This file is referenced by every brief. The executor must treat it as part of each prompt.

## Non-negotiable gates (`.clinerules` Rule 6)

1. **Never weaken security gates**: safe mode, dry-run, command whitelist + metacharacter rejection (`src/tools/security.js`), `resolveSafePath`, MCP env allowlist and consent, `0600` on `~/.emile/config.json`. No brief asks you to change them.
2. Model output is untrusted input: validate paths/arguments at handler boundaries.
3. No API keys, tokens or secrets in logs, error messages, exports or test fixtures.
4. UI rendering only through `ui/` modules and the `C` palette (`src/ui/theme.js`). No direct `picocolors` in agent/api modules (lint enforces).
5. Pure ES modules, **no build step**, no new runtime dependency without an ADR (Rule 2) — none of these briefs require one unless explicitly stated.
6. Out-of-scope findings: report, do not fix in passing (Rule 6.2).

## Every brief follows the same DoD checklist

- [ ] Spec folder created first: `specs/YYYY-MM-DD-<slug>/` with `spec.md` (requirements + ACs), `plan.md` (approach), `tasks.md` (checkboxes) — the brief gives you the content outline; you transcribe + refine.
- [ ] `node --check` on every touched file.
- [ ] `npm test` green (add the tests named in the brief).
- [ ] `npm run lint` clean (ESLint may show pre-existing warnings; never add new errors).
- [ ] Docs sync (Rule 2): `CHANGELOG.md` entry under `[Unreleased]`; update the doc files the brief names.
- [ ] Commits on `development` (Rule 8): conventional commits, explicit `git add <paths>` (never `git add .`), one coherent unit per commit.
- [ ] Final report: files changed + gates output summary + anything NOT done and why.

## Repo facts the executor must know

- Stack: Node >= 18, ESM only, no TypeScript, no bundler. Test runner: `node:test` (`npm test`). Lint: ESLint (`npm run lint`).
- Session state lives in `<workspace>/.emile/`; user-global config/memory in `~/.emile/`.
- `config.js` precedence: `~/.emile/config.json` > provider-specific env var > default. Never reintroduce cross-provider key fallback (IMPROVEMENTS §1.4).
- System prompt is cache-stable per `(plansMode, relevantSkills)` key — anything that injects volatile content there must go through a transient projection instead (deep-dive § 14).
- All code comments and docs in English.
