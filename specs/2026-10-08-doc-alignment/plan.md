# Plan: architecture.md alignment

## Edits

1. `docs/architecture.md`
   - Mermaid §1: `api.js` → `api/`, `ui.js` → `ui/`, `tools.js` → `tools/` (the
     monoliths were extracted into directories; only `src/ui/…` / `src/tools/…` / `src/api/…` exist).
   - mcp.js row (line 48): D1 fix — explicit map key `<server>__<tool>`, no `mcp__` prefix.
   - recovery.js row (line 54): D2+D3+D4 — scan `.emile/history/*.json`, classify
     `tool_pending` checkpoints as `recoverable | corrupt`, strictly read-only,
     `RecoveryReport` regardless of outcome, REPL after scan.
   - history.js row (line 58): "Sessions in `.emile/history/`".
   - Runtime-directories `.emile/` row: "Workspace-scoped session history
     (`.emile/history/`), undo state, web configuration and MCP consent".
   - §4 ADR table: add ADR-0005 (dynamic memory mode) and ADR-0006 (memory
     confirm modal) — both files exist in `docs/adr/`; ADR-0005 is already
     referenced by the memory row.
2. Same-class fixes found by the sweep:
   - `docs/code-quality-and-security.md:32`, `docs/glossary.md:26`,
     `docs/product.md:60` (RF-11): replace `mcp__<server>__<tool>` naming claims.
   - `features/mcp-integration.md:21`: tool-namespace row → `<server>__<tool>`.
   - `features/session-lifecycle.md`: boot description + mermaid (scan
     `.emile/history/*.json`, two-way classification, no move, no `abandoned`),
     lifecycle "5 phase modules" → 6, shutdown mermaid gains the missing
     `flush-memory` phase, changelog row → `recoverable / corrupt`.
3. Commit (explicit paths), CHANGELOG, deep-dive P2-11 tick.

## Deliberately untouched (reported instead)

- ROBUSTNESS-ROADMAP.md (proposed plan, forward-looking vocabulary).
- product.md duplicate RF-07/RF-08 rows.
- architecture.md skills row (P0-2 owns the skills-path decision).
- cli.js `recoveryReport.abandoned` read (P0-3).
