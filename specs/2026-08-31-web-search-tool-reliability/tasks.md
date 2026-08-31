# Tasks: Web search and tool execution reliability

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-31-web-search-tool-reliability` |
| **Status** | `implemented` |

## Phase 0 — Preparation

- [x] T0.1 — Read mandatory product, architecture, UI, security, glossary and ADR context.
- [x] T0.2 — Verify OpenRouter's current server-tool contract and classify the change as high risk.
- [x] T0.3 — Map provider/tool composition, session persistence, cwd, file gates and error paths.

## Phase 1 — Implementation

- [x] T1.1 — Add gated OpenRouter web-search tool composition and configuration toggle *(AC-01, AC-02)*.
- [x] T1.2 — Add persistent workspace-contained session cwd for `runCommand` *(AC-03, AC-04, AC-07)*.
- [x] T1.3 — Improve provider/stream error classification and file-tool boundary validation *(AC-05, AC-06, AC-07)*.
- [x] T1.4 — Add regression tests for provider gating, web toggle, cwd, errors and file boundaries *(AC-01–AC-07)*.

## Phase 2 — Verification

- [x] T2.1 — Run syntax checks, tests, lint and diff check.
- [x] T2.2 — Run safe-mode, dry-run, traversal, cwd and CLI smoke checks.
- [x] T2.3 — Verify every acceptance criterion and record limitations.

## Phase 3 — Documentation and Closing

- [x] T3.1 — Sync README, PRD, architecture, security/glossary/visual docs, feature registry and CHANGELOG on `docs/documentation`.
- [x] T3.2 — Mark spec implemented and record both product and documentation commits.

## Acceptance Criteria Verification Log

| AC | Status | Evidence |
|----|--------|----------|
| AC-01 | ✅ | `test/provider-tools.test.js`: OpenRouter gets the exact bounded server-tool schema; Requesty/OpenCode do not. |
| AC-02 | ✅ | `test/provider-tools.test.js`, `test/commands.test.js`, `node bin/emile.js --help`: default-off provider composition, `/websearch` registration and `--web-search` help/cost warning. |
| AC-03 | ✅ | `test/run-command.test.js`: `mkdir -p site && cd site` changes `config.sessionCwd`; the next `pwd` runs from `site`. |
| AC-04 | ✅ | `src/history.js` normalizes persisted `sessionCwd`; `src/cli.js` and `/switch` restore it; `/new` resets it; missing/legacy values fall back to workspace root. |
| AC-05 | ✅ | `test/api-client.test.js`: 402 classification and secret redaction; stream failures use `formatApiError`. |
| AC-06 | ✅ | `test/write-file.test.js` and `test/edit-file.test.js`: malformed arguments return clear errors without filesystem or undo changes. |
| AC-07 | ✅ | Existing security tests plus `test/run-command.test.js`: dry-run, command failure, outside-workspace cwd and existing path/shell gates remain covered. |

## Verification Evidence

- `node --check` on every touched source file: passed.
- `npm test`: 27/27 tests passed.
- `npm run lint`: passed with 0 errors and 157 pre-existing warnings.
- `git diff --check`: passed.
- `node bin/emile.js --help`: passed and shows `--web-search` with its charge warning.
- A full interactive provider smoke was not run because the repository's configured `mcp.json` starts an external `server-everything` through `npx`; that external MCP initialization can block without network access. The implementation was verified through isolated tests and the CLI help path; no gate was disabled.

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| `60ca112` | `feat(agent): add web search and session cwd` | Product source and regression tests |
| `this commit` | Documentation sync for this spec | README, PRD, architecture, security, glossary, visual identity, feature registry and CHANGELOG |
