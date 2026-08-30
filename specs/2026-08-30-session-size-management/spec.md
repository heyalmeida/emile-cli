# Spec: Bounded session snapshots and cleanup

| Field | Value |
|-------|-------|
| **ID** | `2026-08-30-session-size-management` |
| **Status** | `implemented` |
| **Phase/Context** | Session persistence / backlog item 7.5 |
| **Related documents** | [PRD](../../docs/product.md), [Architecture](../../docs/architecture.md), [Security](../../docs/code-quality-and-security.md), [ADR-0001](../../docs/adr/0001-tech-stack-choice.md) |

## 1. Goal

Keep persisted session files bounded by replacing oldest large tool results with a marker before writing, without changing active in-memory history, and let users remove sessions older than a requested number of days.

## 2. Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| RF-S01 | Persisted sessions respect the configured maximum byte size when trimming tool results can achieve it. | Must |
| RF-S02 | Trimming never mutates the live message list. | Must |
| RF-S03 | `/sessions clean N` deletes only sessions older than N days. | Must |
| RF-S04 | Invalid cleanup input fails without deleting sessions. | Must |

## 3. Risk and Security

| Field | Answer |
|-------|----------|
| **Risk classification** | High — changes durable session data and adds deletion behavior. |
| **Assets/secrets** | Session files under `.emile/history/`. |
| **Command execution / file writes** | Existing history directory only; cleanup targets are explicit session JSON files discovered by `listSessions`. |
| **Untrusted inputs** | Max size and day count are bounded positive numbers; filenames are generated session ids. |
| **Negative criteria** | Active messages remain intact; invalid/negative cleanup values never delete files; no workspace files are targeted. |

## 4. Acceptance Criteria

- **AC-01:** Oversized persisted snapshots trim oldest tool contents to `[truncated]` before save.
- **AC-02:** The live message array retains original tool output.
- **AC-03:** `/sessions clean N` removes only records older than N days and reports the count.
- **AC-04:** Invalid size/age inputs leave the history directory unchanged.

## 5. Out of Scope

- Compressing ordinary user/assistant messages.
- Persistent undo or a global history database.

## 6. References

- `IMPROVEMENTS.md` §7.5
- `src/history.js`, `src/config.js`, `src/commands/handlers.js`
