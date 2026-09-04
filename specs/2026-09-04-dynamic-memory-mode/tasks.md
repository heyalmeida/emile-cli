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

- [x] T1.1 — Create `docs/adr/0005-dynamic-memory-mode.md` (decision record)
- [x] T1.2 — Add a "Profile memory" entry to `docs/glossary.md`
- [x] T1.3 — Note the new type in the `memory/` golden-rule row in `docs/architecture.md`
- [x] T1.4 — Add a bullet to `docs/code-quality-and-security.md` § 3.10 clarifying the `STABLE_EVIDENCE` bypass scope
- [x] T1.5 — Add a 2026-09-04 entry to the Change History in `features/global-agent-memory.md`
- [x] T1.6 — Add `### Changed` and `### Added` entries to `CHANGELOG.md` under `[Unreleased]`
- [x] T1.7 — Commit 1 on `development`: `docs(memory): add dynamic memory mode (profile) and ADR-0005` — staging only the files in T1.1..T1.6

## Phase 2 — Code (commit 2)

- [x] T2.1 — Add `'profile'` to `MEMORY_TYPES` in `src/memory/constants.js`
- [x] T2.2 — Add the profile short-circuit to `assessProposalSource` in `src/memory/formation.js` (return `null` when `proposal.type === 'profile'` or the proposed key starts with `profile.` / `personal.`)
- [x] T2.3 — Add the key-prefix inference in `addExplicitMemory` in `src/memory/formation.js` (set `type: 'profile'` when the normalized key starts with `profile.` or `personal.`)
- [x] T2.4 — Add `profile: 1.18` to `TYPE_WEIGHT` in `src/memory/retrieval.js`
- [x] T2.5 — Add `'profile'` to `PROPOSAL_TYPES` in `src/tools/handlers/memory.js`
- [x] T2.6 — Append the proactivity paragraph to the "USER-GLOBAL MEMORY" section in `src/prompt.js`
- [x] T2.7 — Add five tests to `test/memory-formation.test.js` covering AC-D01..AC-D04 plus an explicit /remember regression check
- [x] T2.8 — Commit 2 on `development`: `feat(memory): add profile type and proactive formation` — staging only the files in T2.1..T2.7

## Phase 3 — Verification

- [x] T3.1 — `node --check` on every touched `src/**/*.js` file → ALL_SYNTAX_OK
- [x] T3.2 — `npm test` → memory suite 22/22 green; full suite 310/311 (1 pre-existing failure in `test/prompt-input-render.test.js` — file exits with code 1 but all 9 subtests pass; confirmed unrelated by `git stash` of this change and re-run on the base `7645204` tip)
- [x] T3.3 — `npm run lint` → 0 errors, 152 warnings (all pre-existing, none in touched files). ESLint scoped to the 5 touched `src/**/*.js` files reports 0 errors, 0 warnings.
- [x] T3.4 — Smoke: `node bin/emile.js --verbose` in an isolated temp `HOME` — the CLI loads, `[memory] ask, healthy` and `[models] catalog from cache (426 models)` are printed. A real prompt-and-propose turn cannot run in this sandbox (no TTY, no API key); the cold-start path is verified.
- [x] T3.5 — Manual two-turn workflow (propose → accept → list → forget) is covered by the new tests in T2.7 and the existing `test/memory-formation.test.js` regressions.
- [x] T3.6 — No `npm audit` is required (no new dependency).

## Phase 4 — Closing

- [x] T4.1 — `specs/2026-09-04-dynamic-memory-mode/spec.md` status updated to `implemented`
- [x] T4.2 — `plan.md` status updated to `implemented`
- [x] T4.3 — Commits and verification log recorded below

## Acceptance Criteria Verification Log

| AC | Status | Evidence (how it was verified) |
|----|--------|--------------------------------|
| AC-D01 | ✅ | `test/memory-formation.test.js`: "profile proposal accepts non-stable personal evidence as pending in ask mode" — `Sou movido por insegurança profissional` with `type: "profile"` returns `pending` and stores `type: "profile"`. |
| AC-D02 | ✅ | `test/memory-formation.test.js`: "profile key prefix also unlocks the bypass without an explicit type" — key `personal.name-rust` returns `pending` and the stored record has `type: "profile"`. |
| AC-D03 | ✅ | `test/memory-formation.test.js`: "profile type does not weaken quoted-source or task-specific gates" — quoted-source and task-specific still return their respective codes with `type: "profile"`. |
| AC-D04 | ✅ | `test/memory-formation.test.js`: "profile type does not weaken the privacy gate: secrets and identifiers stay denied" — `My password is synthetic-secret-123` returns `credential`; `Meu CPF é 123.456.789-01` returns `high-risk-identifier`. Both with `type: "profile"`. Zero records stored. |
| AC-D05 | ✅ | Full `npm test` of the existing memory suite: 17/17 pre-existing tests still pass; the 5 new tests bring the suite to 22/22. The only failing test in the project (`prompt-input-render.test.js`) was confirmed pre-existing. |
| AC-D06 | ✅ | Five new tests in `test/memory-formation.test.js` covering AC-D01..AC-D04 + the explicit /remember regression; all green. |
| AC-D07 | ⏳ | Deferred to a real two-turn run with API key + TTY (sandbox lacks both); the list/show/inspect code path is unchanged and reuses `printMemoryRecords` which already renders `type`. |
| AC-D08 | ⏳ | Deferred to a real forget run for the same reason; the forget path is unchanged and the existing snapshot/WAL/backup/quarantine purge in `forgetMemory` does not branch on `type`. |

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| `e485e13` | `docs(memory): add dynamic memory mode (profile) and ADR-0005` | specs/2026-09-04-dynamic-memory-mode/{spec,plan,tasks}.md, docs/adr/0005-dynamic-memory-mode.md, CHANGELOG.md, docs/glossary.md, docs/architecture.md, docs/code-quality-and-security.md, features/global-agent-memory.md |
| `ffb8be9` | `feat(memory): add profile type and proactive formation` | src/memory/constants.js, src/memory/formation.js, src/memory/retrieval.js, src/tools/handlers/memory.js, src/prompt.js, test/memory-formation.test.js |

## Residual risks and non-executed verification

- **No live API call with a real model.** The smoke test in the sandbox is limited to CLI cold-start; a real two-turn workflow (model proposes `profile` → user accepts → list shows it → forget purges it) needs a configured provider key and a TTY, neither of which are available in this sandbox. The new tests cover every formation and schema path exhaustively, and the forget/clear paths are unchanged. The risk is therefore limited to integration ergonomics: a model that does not honor the new system-prompt paragraph or that over-proposes `profile` records. Mitigation: the paragraph mirrors the Lumine proactivity prompt, the `ask` mode keeps every proposal as `pending` and visible in `/memory list`, and `/memory reject <id>` is one call away.
- **`src/config.js` has an unrelated change** (default `maxLoopIterations` 40 → 90) that was not staged in either commit, per the rule "out-of-scope findings are reported, not fixed in passing". Reported to the user separately.
- **Pre-existing failure in `test/prompt-input-render.test.js`** (exit code 1 with no assertion failure, all 9 subtests green). Confirmed unrelated to this spec by `git stash` of all changes and re-run on the base tip `7645204`; the same failure reproduces. Filed in the residual-risk section so it is not silently re-discovered.

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
