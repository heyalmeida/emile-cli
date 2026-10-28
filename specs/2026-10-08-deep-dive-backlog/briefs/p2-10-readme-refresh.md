# BRIEF P2-10 — README refresh: every claim verifiable against the code

> Read first: `specs/2026-10-08-deep-dive-backlog/_shared-constraints.md` and `docs/deep-dive.md` § 21 (P2-10). **Docs-only brief: no `src/` changes.** Runs BEFORE P0-2/P1-5, so write the README against today's behavior — do not document multi-root skills or the skills path fix as done.

## Goal

`README.md` is the project's front door and currently overpromises: it advertises **40+ bundled skills**, but the repo ships no skills directory (`.gitignore:139-142` excludes `.agent/`, `.agents/`, `.clinerules`) and `loadAllSkills()` (`src/skills.js:51`) points at a non-existent nested path — so today, zero skills load in a fresh clone. Fix every claim of this kind.

## Known-wrong items (verified)

1. **"40+ skills" claim** — replace with an honest description of the mechanism: skills are YAML `SKILL.md` files discovered from `.agent/skills/` (per `docs/architecture.md` § 2 skills.js row); bundled starter skills are being restored by a separate brief, so do not state any bundled count. Mention `-s <list>` and auto-detection (`-s all` default) as the activation paths (`src/cli.js:33`).
2. **Providers/models framing** — the description says "utilizing Requesty API models" (also `package.json:4` and `src/cli.js:27` `.description(...)`). Reality: four gateways — Requesty, OpenRouter, OpenCode Zen, OpenCode Go — via one OpenAI-compatible client (`src/api/client.js:30-68`). Update README (and ONLY README; `package.json`/`cli.js` description strings may be updated in a follow-up if the user asks — flag them in the report instead).
3. **Feature list audit** — every README bullet must be checked against the code. Truth sources: CLI flags `src/cli.js:25-41`; slash commands `src/commands/registry.js` (names + descriptions — do not hand-list from memory); config keys `src/config.js:92-117`; MCP transports `src/mcp.js:77-80` (stdio/sse/http); plans mode `src/plans.js`; global memory `src/memory/`; lifecycle phases `src/lifecycle/`. Remove or correct bullets you cannot verify.

## Sweep method

4. For each README section: extract the claim → locate the implementing code → fix or delete the claim. Do not add claims for features that do not exist yet (no `/provider`, no `modelOverrides`, no multi-root skills — those land via P1-3/P1-5/P1-6 later; their briefs own their README lines).
5. Keep structure/branding (badges, screenshots, install steps) untouched unless factually broken (e.g. a flag that no longer exists).
6. Where the README documents a config key, show real JSON matching `~/.emile/config.json` as written by `saveUserConfig()` (`src/config.js:142-149`): `provider`, `apiKey`, `model`, `effort`, `webSearch`, `maxLoopIterations`.

## Constraints

- Docs in English (ADR-0001). Docs-only: no `src/`, `test/`, `bin/` changes.
- Do not touch `docs/architecture.md` (P2-11 owns it) — coordinate only by not contradicting it.
- Preserve the existing README tone; this is a correction pass, not a rewrite.

## Verification

`git status` shows only `README.md` (+ CHANGELOG) modified. Manual: every flag/command/config key mentioned in the new README exists in `src/cli.js`, `src/commands/registry.js` or `src/config.js`.

## Docs sync (Rule 2)

- CHANGELOG `[Unreleased]` → Docs: README claims aligned with shipped behavior (skills, providers, flags).
- `docs/deep-dive.md` § 21 P2-10: mark applied.
