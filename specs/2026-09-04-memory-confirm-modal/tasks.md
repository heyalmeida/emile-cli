# Tasks: Memory pending-confirmation modal

| Field | Value |
|-------|-------|
| **Spec** | [`2026-09-04-memory-confirm-modal`](./spec.md) |
| **Plan** | [`plan.md`](./plan.md) |

## Phase 0 — Preparation
- [x] T0.1 — Read base spec, ADR-0004, ADR-0005, formation.js, operations.js, retrieval.js, index.js (memory), commands/memory.js, cli.js, ui/memory-panel.js, persistent prompt flow
- [x] T0.2 — Confirm working tree (only the unrelated `src/config.js` change should remain) and branch `development`

## Phase 1 — Documentation (commit 1)
- [ ] T1.1 — Create `docs/adr/0006-memory-confirm-modal.md`
- [ ] T1.2 — Add a 2026-09-04 row to `features/global-agent-memory.md` Change History
- [ ] T1.3 — Add `### Added` entry to `CHANGELOG.md` under `[Unreleased]`
- [ ] T1.4 — Commit 1: `docs(memory): add confirm modal and ADR-0006`

## Phase 2 — Code (commit 2)
- [ ] T2.1 — Create `src/memory/accept-all.js` (single-mutation accept-all)
- [ ] T2.2 — Wire it into `src/memory/index.js`; add `setMemorySkipConfirm` / `isMemorySkipConfirm` / `listPendingMemories`
- [ ] T2.3 — Create `src/ui/memory-modal.js` (per-record `select` + one-shot `confirm` for accept-all)
- [ ] T2.4 — Wire the modal into `src/cli.js` after `runAgentTurn`; cancel on new prompt
- [ ] T2.5 — Add `/memory confirm-on` and `/memory confirm-off` to `src/commands/memory.js`
- [ ] T2.6 — Create `test/memory-accept-all.test.js` covering AC-M01..AC-M05 + atomicity
- [ ] T2.7 — Commit 2: `feat(memory): interactive pending-confirm modal`

## Phase 3 — Verification
- [ ] T3.1 — `node --check` on every touched file
- [ ] T3.2 — `npm test` (full suite)
- [ ] T3.3 — `npm run lint`
- [ ] T3.4 — Smoke: isolated temp home, run a turn that produces 3 pending records, verify modal opens, keyboard navigation works, accept-all is atomic
- [ ] T3.5 — Record verification in this file

## Phase 4 — Closing
- [ ] T4.1 — Update `specs/2026-09-04-memory-confirm-modal/{spec,plan}.md` status to `implemented`
- [ ] T4.2 — Record commits and any non-executed verification

---

## Acceptance Criteria Verification Log

(filled in after T3.x)

| AC | Status | Evidence |
|----|--------|----------|
| AC-M01..AC-M09 | ⏳ | pending |
