# Spec: Multi-level undo

| Field | Value |
|-------|-------|
| **ID** | `2026-08-30-multilevel-undo` |
| **Status** | `implemented` |
| **Phase/Context** | Tools / backlog item 7.1 |
| **Related documents** | [PRD](../../docs/product.md), [Architecture](../../docs/architecture.md), [Code quality](../../docs/code-quality-and-security.md), [ADR-0001](../../docs/adr/0001-tech-stack-choice.md) |

## 1. Problem / Motivation

The undo stack already retains up to 50 prior file states, but the command surface restores only one entry per invocation. Users need a predictable way to roll back several recent changes while preserving the existing single-step behavior.

## 2. Goal

Support `/undo N` for restoring the last N changes, with a review prompt before multi-step restoration and no partial mutation when the user cancels.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-----------|---------------------|
| RF-S01 | `/undo` restores exactly the most recent change. | Must |
| RF-S02 | `/undo N` restores N entries in reverse chronological order. | Must |
| RF-S03 | Multi-step undo shows affected paths and asks for confirmation before writing. | Must |
| RF-S04 | Invalid counts, cancellation and empty stacks leave files and stack unchanged. | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|----------|
| **Risk classification** | High — undo writes files, so incorrect selection can cause data loss. |
| **Assets/secrets** | Workspace files and in-memory prior file contents. |
| **Command execution / file writes** | Existing undo paths originate from safe tool writes; restore uses those exact recorded paths and no new path input. |
| **Untrusted inputs** | Count is user input and is validated as a bounded positive integer. |
| **Negative criteria** | Never pop or write before multi-step approval; never accept count above available entries or non-integer values. |

## 5. Out of Scope

- Persistent undo across sessions.
- Reworking the existing file-state storage format.

## 6. Acceptance Criteria

- **AC-01:** Given one or more entries, `/undo` restores and removes only the latest entry.
- **AC-02:** Given N valid entries, `/undo N` lists the N paths, confirms, then restores them newest first.
- **AC-03:** Given cancellation or an invalid count, no entry is popped and no file is written.
- **AC-04:** Given an empty stack, the command reports that there is nothing to undo.

## 7. References

- `IMPROVEMENTS.md` §7.1
- Existing `src/tools/file-state.js`, `src/commands/handlers.js` and `/undo` registry
