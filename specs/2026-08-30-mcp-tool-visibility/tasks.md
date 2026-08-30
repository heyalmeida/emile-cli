# Tasks: Identify MCP tools in terminal output

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-30-mcp-tool-visibility` |

## Phase 0 — Preparation

- [x] T0.1 — Read MCP, UI, architecture and security context.
- [x] T0.2 — Create and approve spec/plan.
- [x] T0.3 — Classify medium risk and define name-boundary criteria.
- [x] T0.4 — Create feature branch.

## Phase 1 — Implementation

- [x] T1.1 — Add MCP server/tool fields to summary formatting *(AC-01–AC-03)*.
- [x] T1.2 — Add regression tests *(AC-01–AC-03)*.

## Phase 2 — Verification

- [x] T2.1 — Run syntax checks, tests and diff checks.
- [x] T2.2 — Verify acceptance criteria.

## Phase 3 — Documentation

- [x] T3.1 — Sync docs, feature registry, backlog and changelog.
- [ ] T3.2 — Mark spec implemented and commit explicit paths.

## Acceptance Criteria Verification Log

| AC | Status | Evidence |
|----|--------|----------|
| AC-01 | ✅ | `test/mcp-tool-visibility.test.js` verifies `[mcp:filesystem]` fields. |
| AC-02 | ✅ | Test with `team__filesystem__readFile` confirms final-separator parsing. |
| AC-03 | ✅ | Built-in `readFile` test retains the existing `read` label. |

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| | | |
