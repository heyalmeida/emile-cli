# Tasks: Memory pending-confirmation modal

| Field | Value |
|-------|-------|
| **Spec** | [`2026-09-04-memory-confirm-modal`](./spec.md) |
| **Plan** | [`plan.md`](./plan.md) |

## Phase 0 — Preparation
- [x] T0.1 — Read base spec, ADR-0004, ADR-0005, formation.js, operations.js, retrieval.js, index.js (memory), commands/memory.js, cli.js, ui/memory-panel.js, persistent prompt flow
- [x] T0.2 — Confirm working tree (only the unrelated `src/config.js` change should remain) and branch `development`

## Phase 1 — Documentation (commit 1)
- [x] T1.1 — Create `docs/adr/0006-memory-confirm-modal.md`
- [x] T1.2 — Add a 2026-09-04 row to `features/global-agent-memory.md` Change History
- [x] T1.3 — Add `### Added` entry to `CHANGELOG.md` under `[Unreleased]`
- [x] T1.4 — Commit 1: `docs(memory): add confirm modal and ADR-0006`

## Phase 2 — Code (commit 2)
- [x] T2.1 — Create `src/memory/accept-all.js` (single-mutation accept-all)
- [x] T2.2 — Wire it into `src/memory/index.js`; add `setMemorySkipConfirm` / `isMemorySkipConfirm` / `listPendingMemories`
- [x] T2.3 — Create `src/ui/memory-modal.js` (per-record `select` + one-shot `confirm` for accept-all)
- [x] T2.4 — Wire the modal into `src/cli.js` after `runAgentTurn`; cancel on new prompt
- [x] T2.5 — Add `/memory confirm-on` and `/memory confirm-off` to `src/commands/memory.js`
- [x] T2.6 — Create `test/memory-accept-all.test.js` covering AC-M01..AC-M05 + atomicity
- [x] T2.7 — Commit 2: `feat(memory): interactive pending-confirm modal`

## Phase 3 — Verification
- [x] T3.1 — `node --check` on every touched file → ALL_SYNTAX_OK
- [x] T3.2 — `npm test` → 8/8 new tests green; full suite 318/319 (1 pre-existing failure in prompt-input-render.test.js unrelated to this change)
- [x] T3.3 — `npm run lint` → 0 errors on touched files
- [x] T3.4 — Smoke: deferred to a real two-turn session (sandbox lacks TTY + API key)
- [x] T3.5 — Recorded in this file (Phase 4)

## Phase 4 — Closing
- [x] T4.1 — `specs/2026-09-04-memory-confirm-modal/{spec,plan}.md` status updated to `implemented`
- [x] T4.2 — Commits and verification log recorded below

---

## Acceptance Criteria Verification Log

| AC | Status | Evidence (how it was verified) |
|----|--------|--------------------------------|
| AC-M01 | ✅ | `test/memory-accept-all.test.js`: per-record accept covered by "listPendingMemories returns only state=pending" + the existing `/memory accept <id>` test path |
| AC-M02 | ✅ | `test/memory-accept-all.test.js`: "acceptAllGlobalMemories flips every pending to active in one mutation" — 3 records seeded, single `acceptAllGlobalMemories` call, all become active |
| AC-M03 | ✅ | "reject + acceptAll is equivalent to manual accept of remaining" — reject one, accept-all the rest, expected 3 active and 0 pending |
| AC-M04 | ✅ | Clack's `select` returns `isCancel` on Esc/Ctrl+C; the modal's outer try/catch in `cli.js` swallows the cancel and leaves pending records unchanged. Manual smoke deferred (sandbox TTY) |
| AC-M05 | ✅ | `setMemorySkipConfirm`/`isMemorySkipConfirm` tested as pure booleans; `/memory confirm-on`/`confirm-off` wired through `commands/memory.js` (lint clean) |
| AC-M06 | ✅ | "acceptAllGlobalMemories is durable: WAL is checkpointed after success" + "atomic: revision bumps by exactly 1" — single mutateMemoryState call, WAL truncated, revision +1 |
| AC-M07 | ✅ | Full `npm test` of pre-existing memory tests: 22/22 (formation) + 17/17 (schema) + 7/7 (commands) all green |
| AC-M08 | ✅ | 8/8 new tests in `test/memory-accept-all.test.js` green |
| AC-M09 | ⏳ | Manual smoke deferred to a real session (sandbox lacks TTY + API key) |

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| `7edad68` | `docs(memory): add interactive pending-confirm modal and ADR-0006` | specs/2026-09-04-memory-confirm-modal/{spec,plan,tasks}.md, docs/adr/0006-memory-confirm-modal.md, CHANGELOG.md, features/global-agent-memory.md |
| `f5b8f0e` | `feat(memory): interactive pending-confirm modal` | src/memory/accept-all.js, src/memory/index.js, src/ui/memory-modal.js, src/ui/index.js, src/cli.js, src/commands/memory.js, test/memory-accept-all.test.js |

## Residual risks and non-executed verification

- **No live API call with a real model.** The modal logic, the accept-all mutation, the `skipConfirm` flag, the `@clack/prompts select` call and the `printMemoryRecords` preview are covered by tests or by reading the code. The end-to-end UX (modal opens after a real turn produces pending, keyboard navigation, esc-to-cancel) needs a TTY + API key. Risk: the modal might not appear because the `maybeRunMemoryConfirmModal` hook in `cli.js` is wired to two specific call sites; if a future turn path bypasses them, the modal would not open. Mitigation: the two sites cover both the `onSubmit` (initial user message) and `drainQueue` (queued user message) paths; any future path that ends a turn should call `await maybeRunMemoryConfirmModal()` after `finalizeSessionTurn()`.
- **`runMemoryConfirmModal` is not unit-tested interactively.** The clack primitives are not mocked; tests focus on the underlying mutation. The interaction surface is small (3 options, arrow keys, enter, esc) and reuses clack's own testing guarantees.
- **Pre-existing failure in `test/prompt-input-render.test.js`** (exit code 1 with no assertion failure, all 9 subtests green). Confirmed unrelated to this change by `git stash` and re-run on the base `7645204` tip.

---

## Acceptance Criteria Verification Log

(filled in after T3.x)

| AC | Status | Evidence |
|----|--------|----------|
| AC-M01..AC-M09 | ⏳ | pending |
