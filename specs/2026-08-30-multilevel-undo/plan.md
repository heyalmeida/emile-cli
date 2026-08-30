# Plan: Multi-level undo

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-30-multilevel-undo` |
| **Status** | `implemented` |

## 1. Technical Approach

Extend the command dispatcher to recognize `/undo` with an optional numeric argument. Update `handleUndo` to validate the requested count, summarize paths, call an injectable confirmation function for multi-step operations, then restore entries in stack order using the existing recorded absolute paths and contents.

## 2. Security and Verification

No new path resolution or command execution is introduced. Tests cover empty/invalid/cancelled requests, multi-step confirmation and reverse-order restoration in temporary files.

## 3. Files

| Action | Path |
|--------|------|
| Modify | `src/commands/index.js`, `src/commands/handlers.js` |
| Create | `test/undo.test.js` |
| Sync | `docs/product.md`, `docs/architecture.md`, `features/`, `IMPROVEMENTS.md`, `CHANGELOG.md` |

## 4. Git Workflow

| Item | Answer |
|------|--------|
| **Feature branch** | `feat/multilevel-undo` |
| **Commit plan** | Implementation/tests, then documentation/backlog sync; never stage unrelated files. |
