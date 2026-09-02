# Tasks: Workspace file mentions and skill discovery

| Field | Value |
|-------|-------|
| **Spec** | `2026-09-02-file-mentions-and-skills` |

## Phase 0 — Preparation

- [x] T0.1 — Read PRD, architecture, visual identity, security, glossary, ADR-0001 and related rules/skills specs.
- [x] T0.2 — Record the user-approved spec and plan.
- [x] T0.3 — Classify the feature as high risk and define file-disclosure negative scenarios.
- [ ] T0.4 — Switch to `feat/skills-system`, merge current `development` without rewriting shared history, and verify a clean feature scope.

## Phase 1 — Implementation

- [ ] T1.1 — Implement secure extraction, discovery and bounded compilation of file mentions. *(AC-01, AC-03–AC-05)*
- [ ] T1.2 — Integrate per-turn attachments into the agent request with safe warnings. *(AC-01, AC-03)*
- [ ] T1.3 — Add `@` completion to the persistent prompt without regressing slash completion. *(AC-02)*
- [ ] T1.4 — Add skill metadata listing, `/skills` command and safe terminal renderer. *(AC-06)*
- [ ] T1.5 — Add command/help/autocomplete wiring and focused automated tests. *(AC-02–AC-06)*

## Phase 2 — Testing, Security and Verification

- [ ] T2.1 — Run positive, negative, cap-boundary and regression tests; record results.
- [ ] T2.2 — Run syntax checks, lint, full tests, diff check and the smoke test; record any concrete blocker.
- [ ] T2.3 — Manually verify 60/80/120-column UI, Esc and Ctrl+C around mention completion.
- [ ] T2.4 — Verify every acceptance criterion with evidence.

## Phase 3 — Documentation and Closing

- [ ] T3.1 — Update README, PRD, architecture, visual identity, glossary and security documentation.
- [ ] T3.2 — Update `features/skills-system.md` and its index row.
- [ ] T3.3 — Add the CHANGELOG entry.
- [ ] T3.4 — Mark the spec implemented after all evidence is recorded.
- [ ] T3.5 — Commit documentation artifacts on `docs/documentation` with explicit paths.

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
