# Plan: UI commit frontier and viewport-budgeted prompt frame

| Field | Value |
|-------|-------|
| **Spec** | `2026-10-10-ui-commit-frontier` |
| **Status** | `implemented` |

---

## 1. Technical Approach

Three coordinated changes, all inside `src/ui/`:

1. **`src/ui/commit-frontier.js` (new, pure).** `createFrontier({ write, rows })`
   → `{ commit(block), isCommitted(id), pendingCount(), liveRows(), releasedRows() }`.
   `write` is injected (tests drive it with a capture function) and `rows` may be
   a number or a thunk read per commit, so a resize is picked up. The module
   only appends: text plus a trailing newline, never an erase, never a cursor-up.
   The synchronized-output wrapper (`ESC[?2026h`/`l`) lives here too, because the
   frontier is the one choke point every finalized multi-row block passes
   through; it is skipped under `$TMUX` (reference tmux exception).

2. **Route finalized output through it.** `response.js` (completed response box),
   `tool-lines.js` (finished tool grid) and `thinking.js` (closed thinking block:
   `printThinking` and the three `endThinkingStream` closes) accumulate their
   block into one string and commit it once. The streaming (still-open) paths —
   `appendThinkingStream` and the persistent prompt — keep their clamped
   behaviour until they close. `write` is a thunk (`(chunk) => process.stdout.write(chunk)`)
   so the ADR-0003 stdout lease in `turn-keys.js` keeps arbitrating these writes.

3. **Budget the prompt frame.** `buildPromptLayout` gains `maxRows`, interpreted
   as the budget for the **whole assembled block** (the builder is the only place
   that knows how many menu rows exist and whether a footer is present, so the
   chrome accounting must not be duplicated in the caller — that drift is the
   class this spec closes). When the draft does not fit, the input rows are
   windowed around the cursor with dim `⌃ N earlier rows` / `⌄ N later rows`
   markers; the footer is dropped first and then the menu shrinks (windowed
   around the selection) when the budget is below the physical minimum. The
   caller passes `Math.max((process.stdout.rows || 24) - 1, PROMPT_MIN_BLOCK_ROWS)`
   recomputed on every render.

4. **Clamp the remaining sites (P2-19).** `turn-keys.js`, `model-picker.js` and
   `prompt-input.js` route their climbs through `src/ui/terminal-cursor.js`:
   embedded `clampedCursorUp` where the climb belongs to a single atomic frame
   write (the lease rule), otherwise `writeCursorUp`. `clampedCursorUp` now
   reports `0` on a non-TTY stdout, so an embedded escape is suppressed for
   exactly the same reason `writeCursorUp` suppresses its own.

## 2. Architectural Compliance

- **ADR-0001:** no build step, no TypeScript, no new dependency — plain ES
  modules. The reference (Rust) is ported as invariants with `file:line`
  citations, never as a literal translation; a sidecar/Rust TUI would be an
  ADR-level decision and is not attempted.
- **ADR-0003:** the frontier's `write` is injected as a thunk, so a finalized
  block written during a turn still goes through the lease (`turn-keys.js`
  swaps `process.stdout.write` and repaints the live frame around each write).
  The prompt frame is still written as ONE write (the erase, the block and the
  caret reposition are now assembled into a single chunk), which strengthens the
  lease contract instead of bypassing it.
- **Architecture document:** the `ui/` row gains the frontier and the budgeted
  frame; no module boundary moves, and no module outside `ui/` learns to render.
- **Design system:** only `C.dim` (existing token) is used for the elision
  markers; the rendering stays inside `ui/` and consumes `C` (lint-enforced).

**Where the port is an analogue, not a copy (recorded deliberately):**

| Reference mechanism | Emile port | Difference |
|---|---|---|
| `commit.rs:145-168` (`commit_leading_run` over a scrollback entry list, with a commit scan cursor) | `commitFrontier.commit(block)` over an explicit block id, with a pending retry queue | emile has no scrollback block model, so there is no entry index to scan: the caller names the block. The print-once rule, the "failed write stays uncommitted and is retried next frame" rule and the monotone scan order are kept. |
| `terminal.rs:661-687` + `:802-858` (`insert_before_rows`, slack rows) | The frontier only appends text + `\n`; the terminal's own scroll performs the insert | Node has no scroll region API and emile has no layout buffer to diff; "insert" is expressed as "never erase, let it scroll", with the overflow accounted as released rows. |
| `terminal.rs:692-733` (`set_viewport_height` scrolls overflow out before growing) | `buildPromptLayout({ maxRows })` + `PROMPT_MIN_BLOCK_ROWS` | Same invariant (the frame is budgeted by the terminal height, overflow is released, never clipped back), applied to a pure layout builder instead of an inline viewport. |
| `views/agent.rs:423-429` (`rows_available_for_prompt`) | the window computation inside the builder (`budget - chrome - markers`) | Same idea: ask the layout what the fixed chrome costs and give the rest to the prompt. |
| `draw.rs:500-516` (synchronized output, tmux exception) | `wrapSynchronizedOutput` inside the frontier, applied to the prompt frame write | Same markers, same tmux exception, plus a TTY guard (a pipe/redirect/CI log must stay byte-clean — every other cursor escape in emile already carries it). |

## 3. Security and Threat Model

| Element | Handling |
|----------|------------|
| Command execution and whitelist | Not applicable — no execution path is touched. |
| File writes and `resolveSafePath` | Not applicable — nothing is written to disk. |
| LLM inputs (prompt injection / tool args) | Not applicable to the new code: it frames strings that already passed `sanitizeAssistantOutput` / `stripTerminalControls` / `clipLine`. The wrapper is a fixed literal pair, so no input can influence the escape. |
| Secrets (API keys, sessions, exports) | Not applicable — no new output carries state; the frontier stores ids only (never block text). |
| Controls and negative tests | Non-TTY emits no cursor-up and no wrapper; `$TMUX` suppresses the wrapper; the frontier emits no erase/climb; the layout never exceeds `maxRows`; a failed write leaves the block uncommitted. |

## 4. Impacted Modules

| Module | Path | Change |
|--------|---------|---------|
| Commit frontier | `src/ui/commit-frontier.js` | **New** — print-once, retry-on-failure, live-region accounting, synchronized wrapper. |
| Cursor clamp | `src/ui/terminal-cursor.js` | `clampedCursorUp` returns `0` on a non-TTY stdout (one clamp, one rule). |
| Prompt layout | `src/ui/prompt-input-persistent.js` | `maxRows` budget + elision window; the frame is assembled into a single synchronized write; the caller computes the budget from `stdout.rows` per render. |
| Active-turn frame | `src/ui/turn-keys.js` | Clamped climbs (embedded) + budgeted layout. |
| Model picker | `src/ui/model-picker.js` | Clamped climb through the shared helper. |
| Legacy prompt | `src/ui/prompt-input.js` | Clamped climbs (embedded in the atomic frame write; the cleanup climb is one write too). |
| Response box | `src/ui/response.js` | Completed response committed once. |
| Tool grid | `src/ui/tool-lines.js` | Finished tool grid committed once. |
| Thinking | `src/ui/thinking.js` | Closed block (`printThinking` + the three stream closes) committed once; the open stream is untouched. |

## 5. Impacted Flags / Slash Commands / Tools

| Type | Name | Change |
|------|------|--------|
| CLI flag | — | None |
| Slash command | — | None |
| Tool | — | None |
| MCP | — | None |

## 6. Files to Create/Modify

| Action | Path (expected) | Notes |
|------|--------------------|-------------|
| Create | `src/ui/commit-frontier.js` | Pure, injected `write`. |
| Create | `test/commit-frontier.test.js` | print-once, failed-write retry, overflow release, `rows` honoured, no erase ever, wrapper/`$TMUX`. |
| Modify | `src/ui/terminal-cursor.js` | Non-TTY suppression in `clampedCursorUp`. |
| Modify | `src/ui/prompt-input-persistent.js` | `maxRows`, window, single synchronized frame write. |
| Modify | `src/ui/turn-keys.js`, `src/ui/model-picker.js`, `src/ui/prompt-input.js` | P2-19 clamps + budget. |
| Modify | `src/ui/response.js`, `src/ui/tool-lines.js`, `src/ui/thinking.js` | Finalized blocks through the frontier. |
| Modify | `test/prompt-input-render.test.js` | Budget/window cases, F2 clamp cases, emulator learns the DEC 2026 pair. |
| Modify | `CHANGELOG.md`, `docs/architecture.md`, `docs/visual-identity.md`, `docs/deep-dive.md`, `features/terminal-ui.md` | Rule 2 sync. |

## 7. Technical Decisions (summary)

1. `maxRows` is the budget for the **assembled block**, not only for the input
   rows: the builder owns the chrome accounting (menu, borders, footer, markers)
   so the caller cannot drift from it. The caller supplies the physical bound
   (`stdout.rows - 1`).
2. The elision markers are new visual vocabulary: `C.dim`, gutter-indented,
   `⌃ N earlier rows` above the window and `⌄ N later rows` below it.
3. Block identity is explicit: `commit({ id, text })`. Auto ids are used for
   one-shot blocks (a replay must be able to print the same content twice);
   the thinking stream — the only block a caller may close twice — passes
   `thinking:<stream>`.
4. The synchronized wrapper is emitted by the frontier (multi-row commits) and
   around the persistent prompt frame; the active-turn frame already reaches the
   terminal in a single write under the lease, so it needs no wrapper.
5. No new ADR: the decisions above stay inside the documented architecture
   (ADR-0001/0003 are respected, nothing is superseded).

## 8. Verification Strategy and Gates

| AC | Verification |
|----|--------------|
| AC-01..AC-03, AC-07 | `node --test test/commit-frontier.test.js` — print-once, retry-once, released rows, `rows` honoured, "no erase/cursor-up ever emitted", wrapper present on a TTY, absent under `$TMUX` and on a non-TTY. |
| AC-04, AC-05 | `node --test test/prompt-input-render.test.js` — pure layout cases (200-line draft, `maxRows` 23 and 7, marker counts, cursor inside the window) plus emulator cases (block height, no `ESC[nA` above `rows - 1`). |
| AC-06 | `node --test test/prompt-input-render.test.js` (persistent prompt, `rows = 8` and 10) and the F2 cases for `turn-keys`, `model-picker` and `prompt-input` added to the same file. |
| AC-08 | `node --check` on every touched file; the four UI suites; `npm run lint`; `npm test` (441 tests baseline, 0 fail). |
| AC-09 | Rule 2 documents reviewed by inspection (CHANGELOG, architecture, visual identity, deep-dive § 19/§ 20/§ 22.2, `features/terminal-ui.md`). |

## 9. Git Workflow

| Item | Answer |
|------|--------|
| **Working branch** | `development` — no switch, no feature branch, no worktree (Rule 8). |
| **Commit plan** | (1) frontier module + its tests; (2) the layout budget + P2-19 clamps + tests; (3) the docs sync. Explicit paths only, never `git add .`. |

## 10. Failures, Partial State and Rollback

| Topic | Strategy |
|------|------------|
| Error handling and user-facing messages | A `write` that throws never loses the block: it stays pending and the next commit retries it. The frontier itself throws only on a missing `write` (a programming error, at construction time). |
| Interruption (Ctrl+C / Esc) and readline state | Untouched: no stdin path changes, no raw-mode change. |
| Partial state (session, undo stack, file cache) | None — the change renders only. |
| Rollback / undo | Reverting the commit restores the previous renderers; no persisted format changed. |

## 11. Technical Risks and Trade-offs

| Risk | Likelihood | Mitigation |
|-------|---------------|-------------|
| Routing finalized blocks through one write changes the byte pattern the tests capture. | Medium | The accumulated text is byte-identical to the previous stream of writes (each line keeps its `\n`); only the write boundaries and the optional DEC 2026 pair change. The affected suites were run and are green. |
| The layout budget could elide text the user is editing. | Low | The window is centered on the cursor, the counts are printed, and the draft is never modified. |
| The menu shrinking on a tiny terminal could hide the highlighted entry. | Low | The menu is windowed around the selection, so the highlight stays visible whenever at least one menu row survives. |