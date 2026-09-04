# Spec delta: Memory pending-confirmation modal

| Field | Value |
|-------|-------|
| **ID** | `2026-09-04-memory-confirm-modal` |
| **Status** | `draft` |
| **Type** | **Delta to** [`2026-09-03-global-agent-memory`](../2026-09-03-global-agent-memory/spec.md) (UX layer only — no data-layer change) |
| **Phase/Context** | Phase 3 — Agent Robustness (post-delivery) |
| **Related documents** | [Base spec](../2026-09-03-global-agent-memory/spec.md), [ADR-0004](../../docs/adr/0004-global-agent-memory.md), [ADR-0005](../../docs/adr/0005-dynamic-memory-mode.md), **ADR-0006** (this spec introduces it) |

---

## 1. Problem

A `proposeMemory` tool (ADR-0004) creates `pending` candidates in `ask` mode. The user must accept each one explicitly with `/memory accept <id>`. The session `session_1788540742711.json` (2026-09-04 16:52) created 3 pending records; accepting all 3 required 3 separate `/memory list` + `/memory accept <id>` invocations. With 20+ proposals per long session this becomes prohibitive.

`/memory accept all` would solve it but **forces the user to accept bulk** without seeing what they are accepting, and it removes the human-in-the-loop that the spec/ADR-0004 explicitly call out as a feature.

This delta adds a small **interactive modal** that appears at the end of every turn that produced `pending` records, asks for one-by-one decisions, and supports bulk accept with a single keypress.

## 2. Goal

Reduce `/memory accept` overhead from O(records) commands to O(1) modal interactions, **without** removing the user's ability to inspect each record and to reject individual ones.

## 3. Functional delta

| ID | Requirement (delta) | Priority |
|----|---------------------|----------|
| **RF-M01** | After every agent turn that produced ≥1 `pending` record, before the prompt re-attaches, an interactive confirmation modal opens. It shows one record at a time (id, type, key, text) and offers 3 actions: `Aceitar` (accept this one, show next), `Recusar` (reject this one, show next), `Aceitar todas` (accept every remaining pending record, close modal). | Must |
| **RF-M02** | Trigger conditions: `pending > 0 && !memory.skipConfirm`. `memory.skipConfirm` is a per-process boolean (default `false`) that the modal sets to `true` when the user picks `Aceitar todas` (this session only — not persisted, per user choice 5b). | Must |
| **RF-M03** | `Aceitar todas` accepts every remaining `pending` record in **one** atomic mutation (one lock, one WAL append, one snapshot replacement), and sets `memory.skipConfirm = true` for the rest of the process so the modal does not re-open this session. | Must |
| **RF-M04** | `Recusar` removes the current record and shows the next. If it was the last one, the modal closes. | Must |
| **RF-M05** | Submitting a new prompt while the modal is open cancels the modal and processes the prompt first (no queueing). The pending records remain unchanged. | Must |
| **RF-M06** | Two new slash commands: `/memory confirm-on` and `/memory confirm-off` to toggle `memory.skipConfirm` explicitly. `/memory confirm-on` re-enables the modal for the rest of the session. | Should |
| **RF-M07** | The modal reuses `@clack/prompts`'s `select` primitive (already a dep, no new dep). The record preview reuses `printMemoryRecords` to keep the visual contract (`C` palette, open boxes, sanitized text). | Must |
| **RF-M08** | The new accept-all path is **strictly equivalent** to running `acceptMemory(id)` once per remaining `pending` record, in the **same order** the records were created. Idempotent. Atomic. Crash-safe (same lock + WAL + atomic rename as `acceptMemory`). | Must |
| **RF-M09** | No change to the existing `/memory accept <id>` or `/memory reject <id>` commands — they remain the escape hatch when the modal is disabled or unavailable. | Must |

### 3.1 Acceptance criteria

| AC | Scenario | Expected |
|----|----------|----------|
| AC-M01 | A turn produces 3 pending records; modal opens; user picks `Aceitar` 3 times | 3 records become `active`; modal closes; `/memory list` shows 3 active, 0 pending |
| AC-M02 | A turn produces 3 pending records; modal opens; user picks `Aceitar todas` on the first one | 3 records become `active` in a single atomic mutation; modal closes; subsequent turns with new pending do **not** open the modal (skipConfirm is true) |
| AC-M03 | A turn produces 3 pending records; modal opens; user picks `Recusar` on all 3 | 3 records are removed; modal closes; `/memory list` shows 0 pending |
| AC-M04 | A turn produces 3 pending records; modal opens; user submits a new prompt (Enter) while the modal is up | Modal closes immediately; the new prompt is processed first; pending records are unchanged (still 3 pending) |
| AC-M05 | After AC-M02, user runs `/memory confirm-on`; next turn that produces pending re-opens the modal | Modal opens; skipConfirm toggled back to false |
| AC-M06 | The accept-all mutation is atomic | A simulated crash (fault injector on WAL append or temp snapshot) leaves the store in the same revision or one revision higher, never in a torn state — same coverage as the existing `acceptMemory` test |
| AC-M07 | Existing tests in `test/memory-formation.test.js`, `test/memory-commands.test.js` | All pass without modification (regression-free) |
| AC-M08 | New tests in `test/memory-accept-all.test.js` covering AC-M01..AC-M05 + crash-safety | All pass |
| AC-M09 | Smoke: in a real session, the modal opens at the end of a turn that produced pending records; keyboard navigation works (↑/↓ + Enter); sanitization holds (a record with ANSI/OSC controls renders without leakage) | All pass on a manual run |

## 4. Risk, security and threat surfaces

| Field | Answer |
|-------|--------|
| **Risk classification** | **Low–Medium.** No data-layer change; new UX surface; new accept-all path that is equivalent to N times `acceptMemory`. |
| **New attack surface** | (1) A record with ANSI/OSC controls could try to leak into the modal — mitigated by reusing `stripTerminalControls` in `printMemoryRecords` and `printMemoryNotice`. (2) `Aceitar todas` could be triggered by mistake — mitigated by an explicit modal screen that lists the count before the action ("Accept all 3 remaining records?") and by keeping `/memory accept <id>` as the always-available alternative. |
| **Privacy gate** | Unchanged. The modal shows only records that already passed `assessMemoryText` (sensitive + denied records never reach `pending`). Sensitive records are tagged and require explicit accept (existing behavior). |
| **Authority** | Unchanged. Memory is still lower-priority than current user request and project rules. The modal does not change retrieval — it only flips `state` from `pending` to `active`. |
| **Concurrency** | Unchanged. The new `acceptAllPending` mutation reuses `mutateMemoryState` (same lock, same WAL, same atomic rename). The modal runs **between** turns; the agent loop is paused. |
| **Deliberation cost** | The user explicitly chose 5b (per-process, not persisted), so `Aceitar todas` only disables the modal for the rest of the process. A new emile restart re-enables it. This keeps the human-in-the-loop at the natural unit (one work session). |

## 5. Out of scope

- Per-record editing in the modal (user can use `/memory show <id>` + `/forget` + `/remember` to edit, but not from inside the modal — choice 3b).
- Persisting `skipConfirm` to `~/.emile/config.json` — explicitly rejected by user choice 5b.
- Mode change on `Aceitar todas` — user explicitly chose 2a, not 2c.
- Modal re-opening on a new turn that uses `proposeMemory` from inside the modal (modal is single-shot, no nesting).

## 6. Plan reference

See [`plan.md`](./plan.md) for the technical approach, impacted files and commit plan.

## 7. References

- [Base spec](../2026-09-03-global-agent-memory/spec.md) and [base plan](../2026-09-03-global-agent-memory/plan.md).
- [ADR-0004](../../docs/adr/0004-global-agent-memory.md), [ADR-0005](../../docs/adr/0005-dynamic-memory-mode.md), **ADR-0006** (this spec introduces it).
- `@clack/prompts` `select` primitive (already a dep, used by the connect wizard).
- Lumine reference (unrelated project, used for the proactivity idea only).
