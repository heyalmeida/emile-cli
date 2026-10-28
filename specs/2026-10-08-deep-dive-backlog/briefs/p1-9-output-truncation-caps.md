# BRIEF P1-9 — Truncate tool output honestly: middle-cut, total size, spool file, listDir cap

> Read first: `specs/2026-10-08-deep-dive-backlog/_shared-constraints.md` and `docs/deep-dive.md` § 22.3 (tools row).

## Goal

When a command output exceeds the cap, `runCommand` keeps the HEAD (`run-command.js:92-98`) and tells the model to re-run with grep/head/tail — but build/test errors live at the END of the log, so head-truncation discards exactly the payload the model needs, and the "re-run" advice burns another 30s command. grok-build keeps first+last halves, states the TOTAL size, and spools the full output to a file whose path goes into the result (`grok: xai-grok-tools/src/util/truncate.rs:249-276`; `bash/mod.rs:5358`). Also: `listDir` has no output cap at all (`src/tools/handlers/list-dir.js` — verified: no MAX/slice), so a `node_modules` directory floods context.

## Required design (do not re-derive; implement this)

1. New pure util `src/tools/output-truncate.js`:
   - `truncateMiddle(text, { maxChars, headRatio = 0.5 })` → `{ text, truncated, totalChars }`; cut at LINE boundaries (never mid-line); marker in the gap: `[... N of M chars omitted — full output: <spoolPath> ...]` (spoolPath only when provided).
   - `MAX_TOOL_OUTPUT_CHARS = 50_000` exported (same budget as today).
2. `runCommand` (`run-command.js:92-98`): on overflow, write the FULL raw output to `.emile/tmp/out-<pid>-<ts>.log` (workspace-scoped, `fs.mkdirSync(recursive)`; best-effort — if the write fails, omit the path from the marker), apply `truncateMiddle`, and drop the "Use grep, head or tail" advice (the model now has the path and the tail).
3. `listDir`: cap at 200 entries with a trailing line `[... N more entries — use findFiles or a path filter]`; keep the existing sort/order semantics.
4. `grepSearch`/`findFiles` caps stay as they are (50 items — verified present); do NOT change them.
5. The 50k budget stays; undo/checkpoint/dry-run/safe-mode paths untouched.

## Tests to add (extend `test/` — new file `test/output-truncate.test.js` + runCommand cases)

- Unit: `truncateMiddle` on a 100-line log keeps line 1 and line 100, cuts at line boundaries, reports `totalChars`, marker format correct with and without spool path.
- Integration: `runCommand` a command producing >50k chars (e.g. POSIX `seq 1 20000` / Windows `cmd /c for /L %i in (1,1,20000) do @echo %i` — branch on `process.platform`); assert the result contains the FIRST and LAST lines, the `omitted` marker, a `.emile/tmp/out-` path, and that the spool file exists inside the workspace.
- `listDir` on a temp dir with 250 entries: result lists ≤200 + the "more entries" line.

## Constraints

- Spool path must go through the workspace root only (`path.join(config.workspaceDir, '.emile', 'tmp')`) — never an absolute path from model input.
- No new dependencies.

## Verification

`node --check src/tools/output-truncate.js src/tools/handlers/run-command.js src/tools/handlers/list-dir.js && node --test test/output-truncate.test.js && npm run lint && npm test`

## Docs sync (Rule 2)

- CHANGELOG `[Unreleased]` → Changed: tool output truncation keeps the tail (middle-cut + spool file); listDir bounded.
- `docs/deep-dive.md` § 15 (tools) and § 22.3: mark applied.
- `features/built-in-tools.md`: Change History row.
