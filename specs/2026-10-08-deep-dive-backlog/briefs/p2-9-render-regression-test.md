# BRIEF P2-9 — Terminal-emulator regression suite for stream renderers

> Read first: `specs/2026-10-08-deep-dive-backlog/_shared-constraints.md` and `docs/deep-dive.md` § 5-7, § 21 (P2-9). **Depends on P0-1** (append-only thinking renderer must be landed — this brief locks it in with a real regression net).

## Goal

The prompt already has a proper render regression harness: `test/prompt-input-render.test.js` drives `persistentPromptInput` through real keypress sequences against a minimal ANSI terminal emulator (implements exactly `\r \n ESC[K ESC[0J ESC[<n>A ESC[<n>C`, ignores SGR — header comment at `test/prompt-input-render.test.js:1-8`). The stream renderers have NO equivalent, which is exactly how the P0-1 duplicate-thinking bug survived. Generalize the emulator into a shared helper and cover the stream renderers.

## Required design

1. **Extract the emulator** (`test/prompt-input-render.test.js:13` `createEmulator`) into `test/helpers/ansi-emulator.js` exporting `createEmulator(columns, rows)`; make `prompt-input-render.test.js` import it (no behavior change — its existing assertions must keep passing verbatim). Extend the emulator with the sequences the thinking renderer emits after P0-1 (cursor-up `ESC[<n>A`, erase-down `ESC[0J`, plain writes) — implement exactly what the code emits, ignore unknown sequences silently, same policy as today.
2. **`test/thinking-render-regression.test.js`** — drive `startThinkingStream` / `appendThinkingStream` / `endThinkingStream` (`src/ui/thinking.js`) through a fake stdout (PassThrough + injected `columns`/`rows`/`isTTY`), asserting SCREEN STATE after each step, with these scenarios:
   - **Short block, TTY, fits viewport**: in-place redraw path stays active; final screen contains the completion marker exactly once.
   - **Growth past viewport** (`rows = 24`): renderer switches to the append-only path; no cursor-up storm beyond `lastTopOffset` bounds; marker appears exactly once across the whole stream.
   - **Non-TTY** (`isTTY = false`): append-only from the first chunk; nothing but plain text + newlines reaches the stream (no cursor movement escapes at all).
   - **`endThinkingStream` after an over-viewport block**: closes without duplicating the last line.
   - **Rapid interleaving**: thinking deltas interleaved with tool-line output under the ADR-0003 stdout lease (writer swap) — no interleaved garbage, both writers' bytes land intact.
3. **`printAssistantResponse` snapshot** (`src/ui/response.js`, one-shot renderer): golden-style assertions on the emitted lines for a fixture response (markdown with heading, inline code, list) — with and without SGR (strip via `stripAnsi` from `theme.js`) and with `columns: 60` to force wrapping paths. Store expectations inline (small fixtures), not as binary snapshots.
4. **Regression rule**: any future change to `thinking.js` / `response.js` that alters emitted escape sequences must fail these tests — that is the point of the brief. Keep sequence coverage in ONE place (the shared emulator), not duplicated per test file.

## Constraints

- Tests must run on Windows (Git Bash + PowerShell) and Linux: no `process.stdout.rows` reads, no raw-mode requirements — everything injected through the fake stream.
- Node native `node:test` only (ADR-0002); no snapshot library.
- No `src/` changes in this brief EXCEPT if P0-1 left a seam that makes the renderers untestable (e.g. hardcoded `process.stdout`): a minimal injectable-stream parameter is allowed, and if you must touch `src/`, it is limited to adding an optional stream/output parameter with today's `process.stdout` as default — never a renderer rewrite.

## Verification

`node --test test/thinking-render-regression.test.js test/prompt-input-render.test.js test/thinking-stream-append.test.js && npm run lint && npm test`

## Docs sync (Rule 2)

- CHANGELOG `[Unreleased]` → Tests: ANSI-emulator regression suite for thinking/response stream rendering.
- `docs/architecture.md` § 2 ui row (testing note if the file has one) or the test header comment: mention the shared emulator.
- `docs/deep-dive.md` § 21 P2-9: mark applied.
