# Feature: Multi-level Undo

| Field | Value |
|-------|-------|
| **Status** | `active` |
| **Delivery date** | 2026-08-30 |
| **Source spec** | `specs/2026-08-30-multilevel-undo` |
| **PRD RFs served** | RF-06 |
| **Owner/Area** | Tools / Commands |

---

## Description

Emile can revert the most recent file modification with `/undo`, or revert several recent modifications with `/undo N`. Multi-step reversions show the affected paths and require explicit confirmation before changing files.

## Technical Details

| Item | Detail |
|------|---------|
| **Slash commands** | `/undo`, `/undo N` |
| **Configuration** | In-memory bounded `undoStack` (maximum 50 entries) |
| **Applicable security gates** | Entries originate from safe tool writes; no new path or command input is accepted by undo |

## Where It Lives in the Code

| Layer | Main paths |
|-------|------------|
| Command dispatch | `src/commands/index.js`, `src/commands/handlers.js` |
| State | `src/tools/file-state.js` |

## Known Limitations

Undo history is process-local and is not persisted across sessions. It restores recorded paths in memory and does not provide a filesystem snapshot.

## Change History

| Date | Change | Reference |
|------|--------|-----------|
| 2026-08-30 | Added `/undo N` with confirmation and newest-first restoration | Source spec / CHANGELOG |
