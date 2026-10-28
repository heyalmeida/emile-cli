# ADR-0006: Interactive pending-confirmation modal for memory candidates

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-09-04 |
| **Decision owners** | emile-cli maintainers |
| **Related spec** | [`2026-09-04-memory-confirm-modal`](../specs/2026-09-04-memory-confirm-modal/spec.md) |
| **Supersedes** | Nothing (additive UX to [ADR-0004](0004-global-agent-memory.md) and [ADR-0005](0005-dynamic-memory-mode.md)) |

## Context

The user-global agent memory (ADR-0004) creates `pending` candidates in `ask` mode; the user accepts them one by one with `/memory accept <id>`. The session `session_1788540742711.json` (2026-09-04 16:52) produced 3 pending records in one turn; accepting them required 3 separate `/memory list` + `/memory accept <id>` invocations. For long sessions with 20+ candidates this is prohibitive.

A simple `/memory accept all` command would remove the friction but **removes the human-in-the-loop** the spec/ADR-0004 explicitly call out as a feature: the user would never see what is being accepted.

## Decision

Add an interactive `select`-based modal that opens **between turns** when a turn produced ≥1 `pending` record, shows one record at a time, and offers three actions: accept this one, reject this one, accept all remaining and stop asking for the rest of the process.

1. **Modal opens automatically** when `pending.length > 0 && !memory.skipConfirm`. The trigger runs after `runAgentTurn` returns and before the prompt re-attaches. No new slash command is required to use it.
2. **Three actions per record**: `Aceitar` (accept this, show next), `Recusar` (reject this, show next), `Aceitar todas` (accept every remaining pending record in one atomic mutation and set `skipConfirm = true` for the rest of the process).
3. **`Aceitar todas` is a single atomic mutation** through the same `mutateMemoryState` lock + WAL + atomic-rename path as `acceptMemory`. It is functionally equivalent to running `acceptMemory(id)` once per record in creation order, but in one transaction.
4. **`skipConfirm` is per-process** (in-memory only). It is **not** persisted to `~/.emile/config.json` by default — a fresh `emile` restart re-enables the modal. The user can re-enable it mid-session with `/memory confirm-on` and disable it with `/memory confirm-off`.
5. **New prompt cancels the modal** (no queueing). The pending records remain unchanged; the new prompt is processed first. Esc/Ctrl+C also cancels the modal.
6. **The existing `/memory accept <id>` and `/memory reject <id>` commands remain** as the always-available escape hatch for users who prefer the keyboard-only flow.
7. **No new dependency.** `@clack/prompts` `select` and `confirm` are already used by the connect wizard.
8. **No data-layer change.** The new accept-all path reuses `acceptMemory`'s state machine (pending → active, confidence 1, updated timestamp, revision bump).
9. **Sensitive records** keep their explicit accept semantics (the modal shows a `sensitive` badge before each action; the user must still type through each one if they want to keep the explicit accept model). Accept-all also confirms the count once before the bulk action.

## Consequences

### Positive

- Friction drops from O(records) commands to one modal interaction per turn.
- The human-in-the-loop is preserved per record by default; bulk-accept is one explicit keystroke.
- The data-layer invariant is preserved: every `pending` → `active` transition still goes through the same lock + WAL + atomic rename, with the same `purgeCopies: true` to also clean quarantined copies of the selected records.
- The behavior is reversible: `skipConfirm` is per-process, and the existing `/memory` commands remain the source of truth.

### Negative

- Two new process-local flags (`skipConfirm`) and a new module (`src/memory/accept-all.js`, `src/ui/memory-modal.js`) add a small amount of surface area.
- The modal runs between turns; if the user keeps the prompt idle and never submits a new turn, the modal closes after the accept-all (the new behavior the user wanted: no nag screen).
- The first-time `Aceitar todas` shows a one-shot `confirm` ("Accept all 3 remaining records?") — one extra keystroke. This is the cost of preventing bulk-accept mistakes.

## Alternatives considered

| Alternative | Decision | Reason |
|-------------|----------|--------|
| `/memory accept all` slash command | Rejected | Removes the per-record human-in-the-loop. The user explicitly preferred a modal so they can see each record. |
| Persist `skipConfirm` in `~/.emile/config.json` | Rejected | User explicitly chose 5b (per-process only) so the natural unit of "do not nag me" is one work session, not all eternity. |
| Auto-accept on a dedicated `dynamic` mode | Rejected | User explicitly chose 2a, not 2c. The mode change can be added later in a follow-up spec if the modal friction is still too high. |
| Edit the record inside the modal | Rejected | User explicitly chose 3b (reject + next). Editing is two commands and is out of scope. |
| Modal re-opens after a new turn in the same process even if `skipConfirm = true` | Rejected | The user chose 2a: `Aceitar todas` closes the modal. Adding re-opens would defeat the purpose. |

## Follow-up

- Track `Aceitar todas` usage rate. If high, add a `memory.skipConfirm` config flag (separate spec + ADR).
- Track modal cancellation rate. If high, consider per-record accept-all (select 3, accept all 3 in one keystroke).

## References

- Base spec [specs/2026-09-03-global-agent-memory/spec.md](../specs/2026-09-03-global-agent-memory/spec.md).
- ADR-0004, ADR-0005.
- Session `session_1788540742711.json` (2026-09-04 16:52) — the real-world trigger.
- `@clack/prompts` `select` and `confirm` (already a dep).
