# BRIEF P2-7 — Honest context-limit badge: mark fallback-derived limits with `~`

> Read first: `specs/2026-10-08-deep-dive-backlog/_shared-constraints.md` and `docs/deep-dive.md` § 8.1, § 19. **Recommended: land P1-3 (modelOverrides) first** — overrides give exact metadata, making the `~` badge rarer and meaningful.

## Goal

The status bar prints a context limit that is often a GUESS shown as fact. Today a bare OpenCode Zen/Go id (e.g. `stealth/space-bunny-alpha`) resolves through `DEFAULT_MODEL_INFO` → `context: 262000` (or a static regex hit), while three OTHER 128000-ish numbers exist in the codebase: the initial `sessionStats.contextLimit` (`src/agent/session-stats.js:22`), the free-route default (`models.js:16`) and the compression hard-truncate floor (`compression.js:29`). The user sees one confident number whose provenance is unknown. Make provenance visible: exact when known, `~`-prefixed when estimated — the same honesty prefix the status bar already uses for token estimates (architecture invariant 4, `docs/architecture.md:90`).

## Current behavior (facts)

- `getModelInfo(model)` (`src/models.js:58-77`) returns `{ context, inputPrice, outputPrice, reasoning }` with no provenance field.
- Chain: OpenRouter catalog (byExact → bySuffix) → static `MODEL_INFO` table → `DEFAULT_MODEL_INFO` (`models.js:46-51`). P1-3 adds overrides on top; P1-4 adds a models.dev layer.
- `getContextLimit(model)` (`src/agent/session-stats.js:29-40`) wraps `getModelInfo().context`; `sessionStats.contextLimit` feeds the status bar and the compression gate (`agent/agent.js:290-305`).

## Required design

1. **Provenance on the metadata object**: `getModelInfo` gains a last field `source: 'override' | 'catalog' | 'static' | 'default'` (extend, don't break: existing consumers destructure named fields; add `'dev'` to the enum when P1-4 lands). Overrides (P1-3) → `'override'`; catalog hits → `'catalog'`; static table → `'static'`; default → `'default'`. A partial override sets `source: 'override'` only for the fields it actually provided — if `context` came from the override, provenance is exact.
2. **Plumbing**: `sessionStats` gains `contextLimitSource` (string, default `'default'`), set wherever `sessionStats.contextLimit` is set (`agent/agent.js:305`, `session-stats.js` init at `:22` keeps `'default'`).
3. **Display rule** (footer/status-bar renderer, `src/ui/status-bar.js`): if `source` is `override` or `catalog` → print limit as today (e.g. `128K ctx`); if `static` or `default` → print with `~` prefix (e.g. `~128K ctx`), using the palette's muted tone for the tilde, consistent with the existing `~` token-estimate prefix. No other layout change; keep the bar's single-line width budget (clip like other segments).
4. Compression math is untouched: it keeps using the numeric limit. This brief is display + provenance only.
5. When P1-4 is also landed, a models.dev hit maps to `'catalog'` (exact), not a new category.

## Tests to add (`test/context-limit-badge.test.js`)

- `getModelInfo` returns `source: 'default'` for an unknown id, `'catalog'` for a fixture-catalog id, `'static'` for a table-only id (and `'override'` when P1-3 is present).
- Status-bar line contains `~128K` for the default-source case and plain `128K` for the catalog case (drive the status-bar renderer with a fake `sessionStats`, no TTY assumptions).
- Compression gate still triggers at the same thresholds (regression: unchanged numbers).

## Constraints

- UI-only rendering rule (shared constraints): the badge changes nothing about what is sent to the API.
- Keep the status-bar single-line layout: the badge must not wrap or push other segments (reuse the existing width-clipping path).

## Verification

`node --check src/models.js src/agent/session-stats.js && node --test test/context-limit-badge.test.js && npm run lint && npm test`

## Docs sync (Rule 2)

- CHANGELOG `[Unreleased]` → Added: context-limit provenance badge (`~` prefix when the limit is a static/default estimate).
- `docs/architecture.md` invariant 4 (§ 3): extend the `~`-prefix wording to cover the limit badge.
- `docs/deep-dive.md` § 21 P2-7: mark applied.
