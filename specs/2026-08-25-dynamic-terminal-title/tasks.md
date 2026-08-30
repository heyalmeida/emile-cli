# Tasks: Dynamic terminal title by runtime activity

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-25-dynamic-terminal-title` |

---

## Phase 0 — Preparation

- [x] T0.1 — Read mandatory/relevant product, architecture, UI, security, glossary and ADR documentation.
- [x] T0.2 — Approve spec and plan before implementation.
- [x] T0.3 — Classify as **high risk** at the OSC boundary; exclude prompt/command/query content and test control injection.
- [x] T0.4 — Create/switch to `feat/dynamic-terminal-title`; preserve unrelated local changes.

## Phase 1 — Implementation

- [x] T1.1 — Implemented pure sanitized formatting, allowlisted tool descriptions and guarded/deduplicated OSC emission. *(AC-01–AC-05)*
- [x] T1.2 — Integrated CLI startup, MCP, provider/model/session, waiting and shutdown states. *(AC-01, AC-05)*
- [x] T1.3 — Integrated thinking/responding/tool/fallback states through a `runAgent` `finally` wrapper. *(AC-02, AC-05)*
- [x] T1.4 — Integrated context-compression activity only after the compression gate opens. *(AC-02)*

## Phase 2 — Testing, Security and Verification

- [x] T2.1 — `node test/title.test.js`: 7/7 focused tests; `node --test test/title.test.js test/rules.test.js`: 2/2 file suites passed.
- [x] T2.2 — `node --check` passed for all touched JS; `node test-ui.js` passed; approved `openrouter/free` `runAgent` smoke returned `OK`, cost 0 and final `waiting` title.
- [x] T2.3 — Fake TTY/non-TTY/dumb tests, injection test, 100-char cap and command/query redaction passed; no prompt/session-summary contract exists.
- [x] T2.4 — All six acceptance criteria verified below.

## Phase 3 — Documentation and Closing

- [x] T3.1 — Synced README, PRD, architecture, visual identity, security, glossary and roadmap.
- [x] T3.2 — Updated the existing terminal UI feature registry and index source-spec list.
- [x] T3.3 — Added the `[Unreleased]` CHANGELOG entry.
- [x] T3.4 — Markdown tables/links passed the validation script; existing Mermaid remained syntactically unchanged and quoted correctly.
- [x] T3.5 — Marked spec/plan implemented and recorded evidence.
- [x] T3.6 — Prepared only dynamic-title documentation/hunks for closeout on `feat/dynamic-terminal-title`.
- [x] T3.7 — Recorded the pre-existing full-CLI MCP startup hang as an out-of-scope finding; direct agent smoke bypassed MCP and passed.

## Acceptance Criteria Verification Log

| AC | Status | Evidence |
|----|--------|----------|
| AC-01 | ✅ | Activity-first formatting, max length and fake-TTY OSC emission tests |
| AC-02 | ✅ | Built-in/MCP maps + compression activity + lifecycle integration |
| AC-03 | ✅ | Control-injection test produces one safe OSC sequence |
| AC-04 | ✅ | Prompt absent by design; command/search redaction assertions |
| AC-05 | ✅ | Non-TTY/dumb no-op + unexpected-error `finally` reset |
| AC-06 | ✅ | Syntax, focused/regression tests, TUI harness and free-route agent smoke passed |

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| `f44effc` | `docs(spec): define dynamic terminal title states` | `spec.md`, `plan.md`, `tasks.md` |
| `0011686` | `feat(ui): update terminal title from runtime activity` | title UI, CLI/agent/compression integration and focused tests |
