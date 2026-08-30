# Tasks: User-authored project rules system (`.emilerules`)

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-25-rules-system` |

---

## Phase 0 — Preparation

- [x] T0.1 — Read README, PRD, architecture, visual identity, quality/security, glossary, ADR-0001 and the active spec.
- [x] T0.2 — Confirm the revised spec and plan are approved before final implementation.
- [x] T0.3 — Classify risk as **high** because local file content reaches both the LLM and terminal; map symlink escape and ANSI/OSC injection as negative scenarios. Discovery remains read-only and maps no execution/write surface.
- [x] T0.4 — Confirm active feature branch `feat/rules-system` and preserve unrelated working-tree changes.

## Phase 1 — Implementation

- [x] T1.1 — Implement read-only discovery/loading/formatting with precedence, cache and 12k cap. *(AC-01, AC-02)*
- [x] T1.2 — Inject active rules in `buildSystemPrompt()` and add verbose discovery status. *(AC-04)*
- [x] T1.3 — Add `/rules` inspection/help without generating `.emilerules`. *(AC-03, AC-05)*
- [x] T1.4 — Remove the generated repository `.emilerules` and verify the no-file path. *(AC-05)*

## Phase 2 — Testing, Security and Verification

- [x] T2.1 — `node --test test/rules.test.js` passed all focused scenarios (Node reports the file as one suite).
- [x] T2.2 — `node --check` passed for all touched JS; `--help` and `test-ui.js` passed; direct networked `runAgent` smoke returned `OK` with nonzero cost and no crash.
- [x] T2.3 — Verified no command/write path; realpath confinement and terminal-control negative cases pass.
- [x] T2.4 — All seven ACs verified and recorded.

## Phase 3 — Documentation and Closing

- [x] T3.1 — Synced README, PRD, architecture, glossary, security and visual identity.
- [x] T3.2 — Updated `features/project-rules.md` and the index row.
- [x] T3.3 — Updated `CHANGELOG.md` without claiming a bundled `.emilerules`.
- [x] T3.4 — Markdown table columns checked; existing feature Mermaid uses quoted special-character labels and was inspected after edits.
- [x] T3.5 — Marked the spec implemented after evidence was recorded.
- [x] T3.6 — Prepared only rules-system documentation for the closeout commit on `feat/rules-system`.
- [x] T3.7 — Full `node bin/emile.js --verbose <prompt>` was blocked before the agent by a pre-existing MCP initialization hang; the direct `runAgent` smoke passed with approved network access.

## Acceptance Criteria Verification Log

| AC | Status | Evidence |
|----|--------|----------|
| AC-01 | ✅ | Precedence + formatting assertions in `test/rules.test.js` |
| AC-02 | ✅ | 12k boundary + 12k+1 truncation assertions |
| AC-03 | ✅ | CLI dispatch/help/autocomplete + inactive state verification |
| AC-04 | ✅ | Prompt integration script + verbose branch syntax check |
| AC-05 | ✅ | No root `.emilerules`; no-file prompt assertion |
| AC-06 | ✅ | Syntax, focused tests, help, TUI harness and direct agent smoke passed |
| AC-07 | ✅ | External symlink + terminal-control negative tests passed |

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| `75d1f92` | `docs(spec): define user-authored project rules` | `spec.md`, `plan.md`, `tasks.md` |
| `ad59d03` | `feat(rules): honor user-authored project preferences` | rules/prompt/CLI/UI modules + focused tests |
