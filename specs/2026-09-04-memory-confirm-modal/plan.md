# Plan: Memory pending-confirmation modal

| Field | Value |
|-------|-------|
| **Spec** | [`2026-09-04-memory-confirm-modal`](./spec.md) |
| **Status** | `implemented` |

## 1. Technical approach

Add an interactive `select`-based modal that opens at the end of every turn that produced `pending` records, with three actions: accept, reject, accept-all-and-stop-asking. The new accept-all mutation is a one-shot variant of `acceptMemory` that runs the same `mutateMemoryState` lock and atomic-rename.

### 1.1 State

Two new process-local flags, both set in `src/memory/index.js`:

- `skipConfirm: boolean` (default `false`).
- The existing `pendingTouches` and `paused` mechanisms stay; we only add `skipConfirm`.

No JSON store change. No schema migration.

### 1.2 Modules

| Action | Path | Change |
|--------|------|--------|
| Create | `src/memory/accept-all.js` | `acceptAllPending(options)` — single `mutateMemoryState` that flips every `state === 'pending'` record to `active`, sets `confidence = 1`, updates `updatedAt` and bumps `revision` once. Reuses `withMemoryLock`, `appendMemoryWal`, `writeAtomicMemoryFile`. |
| Modify | `src/memory/index.js` | Export `acceptAllPending`; export `setMemorySkipConfirm` and `isMemorySkipConfirm`; export `listPendingMemories` (filter `state === 'pending'`). |
| Create | `src/ui/memory-modal.js` | `runMemoryConfirmModal(pending, options)` — `@clack/prompts` `select` per record with `accept` / `reject` / `acceptAll`; or a one-shot `confirm` for the `acceptAll` screen. Reuses `printMemoryRecords` to render the preview. |
| Modify | `src/cli.js` | After `runAgentTurn` returns and before the prompt re-attaches: if `pending.length > 0 && !skipConfirm`, call `runMemoryConfirmModal`. If the user submits a new prompt while the modal is up, the existing `drainQueue` + `pendingQueue` flow cancels the modal first (the modal exposes a `cancel()` callback bound to a one-shot `AbortSignal`). |
| Modify | `src/commands/memory.js` | New subcommand `/memory confirm-on` and `/memory confirm-off` that toggle the process-local flag. |
| Create | `test/memory-accept-all.test.js` | Tests: AC-M01..AC-M05, AC-M06 (atomic with fault injection), AC-M08 (no regression in existing tests). |
| Modify | `features/global-agent-memory.md` | New Change History row. |
| Modify | `CHANGELOG.md` | New `[Unreleased]` entry. |
| Create | `docs/adr/0006-memory-confirm-modal.md` | Decision. |

### 1.3 No new dependency

`@clack/prompts` is already used by the connect wizard (`src/commands.js:103`). `select` and `confirm` are already imported elsewhere.

## 2. Architectural compliance

- **ADR-0001** (Node + pure ESM, no build) — preserved: zero new dep, one new module, one new spec file.
- **ADR-0002** (quality gates) — preserved: `node --check`, `npm test`, `npm run lint`, manual smoke.
- **ADR-0003** (active prompt arbitration) — preserved: the modal runs **between** turns; the prompt is detached before the modal opens and re-attached after it closes. No concurrent stdout writers.
- **ADR-0004** (memory boundary) — preserved: `acceptAllPending` runs the same lock, the same WAL, the same atomic rename as `acceptMemory`. The state machine is unchanged (pending → active with confidence 1).
- **ADR-0005** (profile type) — preserved: the new path accepts records of any `type` (including `profile`).
- **Mandatory path rule** — preserved: the modal calls only public memory functions, never raw I/O.

## 3. Security

| Element | Handling |
|---------|----------|
| **ANSI/OSC in records** | `printMemoryRecords` already calls `stripTerminalControls`; the modal preview goes through it. |
| **Sensitive records** | Tagged with `sensitivity === 'sensitive'` by `assessMemoryText`; the modal shows a `sensitive` badge and confirms before accepting (existing rule). |
| **Accept-all mistake** | The first time the user picks `acceptAll`, the modal shows a one-shot `confirm` with the count ("Accept all 3 remaining records?"). After the user confirms once for that batch, no further confirmation per record. |
| **Submit-while-modal** | The modal registers a one-shot cancel that the REPL's `drainQueue` triggers when a new prompt arrives. The pending records are unchanged. |
| **Atomicity** | `acceptAllPending` calls `mutateMemoryState` exactly once; the lock + WAL + atomic-rename + `purgeCopies: true` path is identical to `acceptMemory`. |

## 4. Impacted files

| Action | Path |
|--------|------|
| Create | `src/memory/accept-all.js` |
| Modify | `src/memory/index.js` |
| Create | `src/ui/memory-modal.js` |
| Modify | `src/cli.js` |
| Modify | `src/commands/memory.js` |
| Create | `test/memory-accept-all.test.js` |
| Create | `docs/adr/0006-memory-confirm-modal.md` |
| Modify | `features/global-agent-memory.md` |
| Modify | `CHANGELOG.md` |

## 5. Commit plan

Two coherent commits on `development`:

1. `docs(memory): add confirm modal and ADR-0006` — spec, plan, tasks, ADR, CHANGELOG, feature registry.
2. `feat(memory): interactive pending-confirm modal` — `src/memory/accept-all.js`, `src/memory/index.js`, `src/ui/memory-modal.js`, `src/cli.js`, `src/commands/memory.js`, `test/memory-accept-all.test.js`.

## 6. Verification

1. `node --check` on every touched file.
2. `npm test` (full suite; expect green; new tests in `test/memory-accept-all.test.js` pass).
3. `npm run lint` (0 errors; new files 0 warnings).
4. Smoke: in an isolated temp home, run a turn that produces 3 pending records, verify the modal opens, the keyboard navigation works, and the records are accepted atomically.

## 7. Out of scope (deferred)

- Persisting `skipConfirm` to `~/.emile/config.json` (rejected by user choice 5b).
- Per-record editing from inside the modal (rejected by user choice 3b).
- Mode change on accept-all (rejected by user choice 2a).
