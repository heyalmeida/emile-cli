# Spec: docs/architecture.md alignment with shipped code (P2-11)

Date: 2026-10-08 · Branch: `development` · Docs-only (no changes under `src/`, `test/`, `bin/`)

## Problem

`docs/architecture.md` is declared the structural source of truth but describes
behavior that does not exist:

- **D1 (line 48, mcp.js row):** claims tools are namespaced `mcp__<server>__<tool>`.
  Reality: `src/mcp.js:14-17` builds an explicit `'server__tool'` → `{serverName, toolName}`
  map at connect time; resolution is a direct lookup ("no string parsing, no collision
  when a server name itself contains `__'`). No `mcp__` marker exists in resolution.
- **D2 (line 54, recovery.js row):** claims a three-way classification
  (`recoverable`, `abandoned`, `corrupt`). Reality: `src/recovery.js:18-29` typedef
  defines only `recoverable | corrupt`; `RecoveryReport` has no `abandoned` field.
- **D3 (same row):** claims corrupt sessions are "moved to
  `.emile/sessions/<id>/corrupt/`". Reality: `runStartupRecovery` (`src/recovery.js:82-106`)
  is strictly read-only — it never moves or rewrites anything. (`history.js:241`
  `moveToCorrupt` exists but has zero callers — dead code.)

## Verified context

- Persisted sessions live at `.emile/history/<id>.json` (`src/history.js:8`, `recovery.js:83`).
  No `.emile/sessions/` directory exists for live sessions.
- Scanner today filters `record.status !== 'pending'` (`recovery.js:95`), but
  `saveSession` persists only `tool_pending | complete` (`history.js:82`) — the
  scanner never fires. Brief P0-3 (separate) fixes the filter; per this brief's
  Step 4 the doc wording targets the POST-P0-3 reality (`tool_pending`), noted in
  the commit message as a forward-looking alignment.
- `src/lifecycle/` has 6 phase modules + barrel (stop-input, drain-tools,
  flush-session, flush-memory, close-mcp, restore-terminal); global cap 3 s.

## Requirements

- R1. architecture.md mcp.js row: tools registered under explicit map key
  `<server>__<tool>` (direct lookup, no prefix); keep the "UI resolves the final
  separator consistently with the explicit map" clause. No `mcp__` claim remains.
- R2. architecture.md recovery.js row: scan of `.emile/history/*.json`, two-way
  classification (`recoverable | corrupt`), strictly read-only, `RecoveryReport`
  returned regardless of outcome; scanner wording says `tool_pending`; no
  `abandoned`, no quarantine-move claim, no invented behavior.
- R3. architecture.md history.js row + Runtime-directories table: sessions named
  precisely at `.emile/history/`.
- R4. Sweep of every file in `docs/` EXCLUDING `docs/deep-dive.md` for the same
  class of error (falsifiable claims about paths, filenames, identifiers,
  directory layout); fix where the doc diverges from `src/` as shipped. Never
  touch code to make docs true.
- R5. `features/` registry (Rule 7): update files describing pre-drift behavior
  in the same commit.
- R6. CHANGELOG `[Unreleased]` Docs entry; deep-dive § 21 P2-11 marked applied.

## Sweep method

1. Grep `docs/` (excl. deep-dive.md) and `features/` for the three claim
   signatures: `mcp__`, `abandoned`, `.emile/sessions`, `<id>/corrupt`.
2. Read the small docs in full (glossary, code-quality-and-security) and grep the
   rest for path-like tokens (`.emile/`, `.agent/`, `src/`, `~/`); verify each hit
   against the current `src/` tree.
3. Verify module-map identifiers in architecture.md against `ls src/` and targeted
   greps (rules chain, lifecycle phases, memory root, ADR files).

## Out of scope (report only)

- `src/cli.js:154` reads `recoveryReport.abandoned` — code drift owned by P0-3.
- `README.md` — owned by P2-10.
- `docs/deep-dive.md` — the analysis doc itself.
- `docs/ROBUSTNESS-ROADMAP.md` — explicitly "🟡 Proposed… Nothing here is
  implemented yet"; plan-of-attack vocabulary, not shipped-behavior claims.
- `docs/product.md` duplicate RF-07/RF-08 rows (54-57) — internal duplication
  bug, not a doc-vs-code divergence.
- architecture.md skills row (`.agent/skills/`) — owned by P0-2 (skills path decision).

## Acceptance criteria

- [ ] mcp.js row: explicit `<server>__<tool>` map naming; no `mcp__` claim remains.
- [ ] Recovery row: two-way classification, read-only, `.emile/history/`,
      scanner wording `tool_pending`; no `abandoned`, no quarantine move.
- [ ] No doc implies `.emile/sessions/` holds live sessions.
- [ ] `git status` shows only `docs/` + `CHANGELOG.md` (+ `features/`).
- [ ] `npm run lint` unchanged/green; every identifier named in edited sections exists.
