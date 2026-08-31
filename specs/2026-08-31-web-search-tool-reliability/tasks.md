# Tasks: Web search and tool execution reliability

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-31-web-search-tool-reliability` |
| **Status** | `approved` |

## Phase 0 — Preparation

- [x] T0.1 — Read mandatory product, architecture, UI, security, glossary and ADR context.
- [x] T0.2 — Verify OpenRouter's current server-tool contract and classify the change as high risk.
- [x] T0.3 — Map provider/tool composition, session persistence, cwd, file gates and error paths.

## Phase 1 — Implementation

- [ ] T1.1 — Add gated OpenRouter web-search tool composition and configuration toggle *(AC-01, AC-02)*.
- [ ] T1.2 — Add persistent workspace-contained session cwd for `runCommand` *(AC-03, AC-04, AC-07)*.
- [ ] T1.3 — Improve provider/stream error classification and file-tool boundary validation *(AC-05, AC-06, AC-07)*.
- [ ] T1.4 — Add regression tests for provider gating, web toggle, cwd, errors and file boundaries *(AC-01–AC-07)*.

## Phase 2 — Verification

- [ ] T2.1 — Run syntax checks, tests, lint and diff check.
- [ ] T2.2 — Run safe-mode, dry-run, traversal, cwd and CLI smoke checks.
- [ ] T2.3 — Verify every acceptance criterion and record limitations.

## Phase 3 — Documentation and Closing

- [ ] T3.1 — Sync README, PRD, architecture, security/glossary/visual docs, feature registry and CHANGELOG on `docs/documentation`.
- [ ] T3.2 — Mark spec implemented and record both product and documentation commits.

## Acceptance Criteria Verification Log

| AC | Status | Evidence |
|----|--------|----------|
| AC-01 | ⏳ | |
| AC-02 | ⏳ | |
| AC-03 | ⏳ | |
| AC-04 | ⏳ | |
| AC-05 | ⏳ | |
| AC-06 | ⏳ | |
| AC-07 | ⏳ | |

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| | | |
