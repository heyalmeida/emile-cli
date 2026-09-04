# Tasks: Dynamic memory mode for personal profile facts

| Field | Value |
|-------|-------|
| **Spec** | [`2026-09-04-dynamic-memory-mode`](./spec.md) |
| **Plan** | [`plan.md`](./plan.md) |

---

## Phase 0 — Preparation

- [x] T0.1 — Read the base spec, plan, tasks, ADR-0004, code-quality, glossary, architecture, prompt.js, formation.js, retrieval.js, schema.js, privacy.js, constants.js, handlers/memory.js, command tests, formation tests, schema tests, tools tests — *Rule 1 of `.clinerules`*
- [x] T0.2 — Classify the change as **Medium** risk (data-layer additive + small prompt change) and record the privacy-gate dominance in the spec
- [x] T0.3 — Confirm the working branch is `development` and the working tree is clean except for the unrelated `docs/PROMPT-SYSTEM-ANALYSIS.md` file — *Rule 8 of `.clinerules`*

## Phase 1 — Documentation (commit 1)

- [ ] T1.1 — Create `docs/adr/0005-dynamic-memory-mode.md` (decision record)
- [ ] T1.2 — Add a "Profile memory" entry to `docs/glossary.md`
- [ ] T1.3 — Note the new type in the `memory/` golden-rule row in `docs/architecture.md`
- [ ] T1.4 — Add a bullet to `docs/code-quality-and-security.md` § 3.10 clarifying the `STABLE_EVIDENCE` bypass scope
- [ ] T1.5 — Add a 2026-09-04 entry to the Change History in `features/global-agent-memory.md`
- [ ] T1.6 — Add `### Changed` and `### Added` entries to `CHANGELOG.md` under `[Unreleased]`
- [ ] T1.7 — Commit 1 on `development`: `docs(memory): add dynamic memory mode (profile) and ADR-0005` — staging only the files in T1.1..T1.6

## Phase 2 — Code (commit 2)

- [ ] T2.1 — Add `'profile'` to `MEMORY_TYPES` in `src/memory/constants.js`
- [ ] T2.2 — Add the profile short-circuit to `assessProposalSource` in `src/memory/formation.js` (return `null` when `proposal.type === 'profile'` or the proposed key starts with `profile.` / `personal.`)
- [ ] T2.3 — Add the key-prefix inference in `addExplicitMemory` in `src/memory/formation.js` (set `type: 'profile'` when the normalized key starts with `profile.` or `personal.`)
- [ ] T2.4 — Add `profile: 1.18` to `TYPE_WEIGHT` in `src/memory/retrieval.js`
- [ ] T2.5 — Add `'profile'` to `PROPOSAL_TYPES` in `src/tools/handlers/memory.js`
- [ ] T2.6 — Append the proactivity paragraph to the "USER-GLOBAL MEMORY" section in `src/prompt.js`
- [ ] T2.7 — Add four tests to `test/memory-formation.test.js` covering AC-D01..AC-D04
- [ ] T2.8 — Commit 2 on `development`: `feat(memory): add profile type and proactive formation` — staging only the files in T2.1..T2.7

## Phase 3 — Verification

- [ ] T3.1 — `node --check` on every touched `src/**/*.js` file
- [ ] T3.2 — `npm test` (full suite; expect green including the four new tests)
- [ ] T3.3 — `npm run lint` (expect zero errors)
- [ ] T3.4 — Smoke: `node bin/emile.js --verbose` in an isolated temporary home; submit a turn that asks the model to propose a `profile` memory; verify the record is `pending` (in `ask` mode)
- [ ] T3.5 — Manual two-turn workflow on a fake memory: propose → accept → list → forget; record expected and actual in this file
- [ ] T3.6 — No `npm audit` is required (no new dependency)

## Phase 4 — Closing

- [ ] T4.1 — Update `specs/2026-09-04-dynamic-memory-mode/spec.md` status to `implemented`
- [ ] T4.2 — Update `plan.md` status to `implemented`
- [ ] T4.3 — Record commits and any non-executed verification in this file

---

## Acceptance Criteria Verification Log

| AC | Status | Evidence (how it was verified) |
|----|--------|--------------------------------|
| AC-D01 | ⏳ | pending T3.2 |
| AC-D02 | ⏳ | pending T3.2 |
| AC-D03 | ⏳ | pending T3.2 |
| AC-D04 | ⏳ | pending T3.2 |
| AC-D05 | ⏳ | pending T3.2 (regression-free existing 56-file suite) |
| AC-D06 | ⏳ | pending T3.2 (new four tests) |
| AC-D07 | ⏳ | pending T3.4 |
| AC-D08 | ⏳ | pending T3.5 |

> Legend: ⏳ pending / ✅ verified / ❌ failed (go back to implementation)

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| (pending) | `docs(memory): add dynamic memory mode (profile) and ADR-0005` | T1.1..T1.6 |
| (pending) | `feat(memory): add profile type and proactive formation` | T2.1..T2.7 |
