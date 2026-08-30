# Tasks: [Spec title]

> Fill in from the `plan.md`. Each task must be small, verifiable and traceable to an acceptance criterion (AC). Mark `- [x]` only after verifying.

| Field | Value |
|-------|-------|
| **Spec** | `YYYY-MM-DD-spec-name` |

---

## Phase 0 — Preparation

- [ ] T0.1 — Read relevant documentation (PRD, architecture, visual identity, ADRs) — *Rule 1 of `.clinerules`*
- [ ] T0.2 — Confirm this spec and plan are `approved`
- [ ] T0.3 — Classify risk, map threat surfaces and confirm the plan's gates
- [ ] T0.4 — Create/switch to the feature branch (e.g., `feat/<spec-name>`) — *Rule 8 of `.clinerules`*

## Phase 1 — Implementation

- [ ] T1.1 — [Task description] *(verifies AC-XX)*
- [ ] T1.2 —
- [ ] T1.3 —

> Commit as each coherent unit completes, staging ONLY this feature's files (Rule 8). Record the commit hashes below.

## Phase 2 — Testing, Security and Verification

- [ ] T2.1 — Run the positive, negative, boundary and regression checks defined in the plan (documented manual scripts until an automated suite exists)
- [ ] T2.2 — Run `node --check` on all touched files and the smoke test; record commands and results
- [ ] T2.3 — Run `npm audit` if there is a new dependency and triage every finding
- [ ] T2.4 — Verify ALL of the spec's acceptance criteria, one by one

## Phase 3 — Documentation and Closing

- [ ] T3.1 — Execute Rule 2 of `.clinerules` (sync of affected docs, including README for flags/commands/tools)
- [ ] T3.2 — If it's a new/changed feature, create or update `features/feature-name.md` (Rule 7) and the index
- [ ] T3.3 — Record the entry in `CHANGELOG.md`
- [ ] T3.4 — Revalidate touched Mermaid blocks
- [ ] T3.5 — Update the spec status to `implemented`
- [ ] T3.6 — Commit the documentation sync on the feature branch (only the files of this feature — Rule 8)
- [ ] T3.7 — Record in the handoff limitations, non-executed verifications and residual risk

---

## Acceptance Criteria Verification Log

| AC | Status | Evidence (how it was verified) |
|----|--------|--------------------------------|
| AC-01 | ⏳ | |
| AC-02 | ⏳ | |

> Legend: ⏳ pending / ✅ verified / ❌ failed (go back to implementation)

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| | | |
