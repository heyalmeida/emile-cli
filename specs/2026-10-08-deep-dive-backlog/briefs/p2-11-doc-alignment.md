# BRIEF P2-11 — Align `docs/architecture.md` with the shipped code (docs-only)

> Read first: `specs/2026-10-08-deep-dive-backlog/_shared-constraints.md` and `docs/deep-dive.md` § 10, § 16, § 21 (P2-11). **Docs-only brief: no `src/` changes.** Fix the docs to match reality, never the reverse.

## Goal

`docs/architecture.md` is declared "Structural source of truth" (line 3) but carries three verified drifts against `src/`. Fix them and sweep the rest of `docs/` for the same class of error.

## Verified drift items (fix these, exact wording guidance)

1. **`docs/architecture.md:48` (mcp.js row)** — claims tools are namespaced `mcp__<server>__<tool>`. The actual registry is the explicit map at `src/mcp.js:14-17` keyed `'server__tool'` (comment: "no string parsing, no collision when a server name itself contains '__'"). There is no `mcp__` prefix anywhere in resolution. Rewrite the claim to: tools are registered under their explicit map key `<server>__<tool>` (direct Map lookup, no parsing, no `mcp__` prefix); keep the existing clause about the UI resolving the separator consistently.
2. **`docs/architecture.md:54` (recovery.js row)** — claims a THREE-way classification (`recoverable`, `abandoned`, `corrupt`) and that corrupt sessions are "moved to `.emile/sessions/<id>/corrupt/`". Reality (`src/recovery.js`): the typedef at `recovery.js:18-29` defines only `recoverable | corrupt`; the `RecoveryReport` has NO `abandoned` field and NO session-moving logic — the scan is strictly read-only (`recovery.js:82-106`), scanning `.emile/history/` (`:83`). Rewrite the row to describe what exists: scan of `.emile/history/*.json`, two-way classification, read-only, report returned regardless of outcome. Do NOT invent a quarantine move to justify the doc — the move is a possible future feature (deep-dive § 21), not current behavior.
3. **`docs/architecture.md:54` — `pending` vs `tool_pending`**: the row says the scanner classifies "every `pending` checkpoint". The scanner filters `record.status !== 'pending'` (`recovery.js:95`) but `saveSession` persists only `tool_pending | complete` (`src/history.js:82`). P0-3 (separate brief) fixes the scanner to filter `tool_pending`. In THIS brief, write the row against the POST-P0-3 reality (scanner filters `tool_pending` checkpoints), so the doc does not need a second edit after P0-3 lands. Note it in the brief's commit message as a forward-looking alignment.
4. **`docs/architecture.md:54` / directory table** — any reference to a `.emile/sessions/` directory for live sessions must not imply it exists: persisted sessions live at `.emile/history/<id>.json` (`history.js`). Keep `.emile/sessions/<id>/corrupt/` OUT of the doc unless P0-3 actually lands a quarantine move.

## Sweep method (same class of error, rest of docs/)

5. For every file in `docs/` (excluding `docs/deep-dive.md`, which is the analysis that FOUND this drift): extract each falsifiable claim about paths, filenames, function/identifier names and directory layout, verify it against the current `src/` tree, and fix the doc where it diverges. Known-suspect areas: module rows in `docs/architecture.md` § 2, "Runtime directories" table (line 60-68), and ADR cross-references. Do not touch code to make docs true.
6. `features/` registry (Rule 7): if any feature file describes the pre-drift behavior (e.g. a `mcp__` naming claim or an `abandoned` recovery classification), update the feature doc in the same commit.

## Constraints

- Docs in English (ADR-0001). Keep the existing doc voice and table format.
- NO changes under `src/` or `test/` in this brief.
- The `pending`→`tool_pending` wording in item 3 is the ONLY intentional forward-reference; everything else must match code AS IT IS today.

## Verification

`npm run lint` (docs don't lint, but prove the tree is untouched: `git status` shows only `docs/` + CHANGELOG edits) and a manual pass: every file path, directory and identifier named in the edited doc sections exists in the repo.

## Docs sync (Rule 2)

- CHANGELOG `[Unreleased]` → Docs: architecture.md aligned with shipped recovery/MCP/history behavior.
- `docs/deep-dive.md` § 21 P2-11: mark applied.
