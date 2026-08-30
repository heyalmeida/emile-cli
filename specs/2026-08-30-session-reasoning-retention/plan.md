# Plan: Keep model reasoning out of persisted sessions by default

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-30-session-reasoning-retention` |
| **Status** | `implemented` |

## 1. Technical Approach

Add a non-mutating message projection in `history.js` that removes only `reasoning_content` before `JSON.stringify`. Add the global `--export-thinking` option and pass it through the existing command context; `handleExport` will include thought blocks only when the flag or an explicit `/export --export-thinking` argument is present.

## 2. Architectural and Security Compliance

Persistence remains owned by `history.js`, export rendering remains in the command handler, and no tool/path/security gate is bypassed. The opt-in is explicit and defaults to omission.

## 3. Verification

Test the projection for non-mutation/field preservation and exercise export content with mocked file output. Run syntax checks, `npm test` and `git diff --check`.

## 4. Git Workflow

| Item | Answer |
|------|--------|
| **Feature branch** | `feat/session-reasoning-retention` |
| **Commit plan** | Implementation/tests, then docs/backlog/registry; never stage unrelated files. |
