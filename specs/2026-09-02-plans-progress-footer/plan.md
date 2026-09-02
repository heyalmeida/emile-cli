# Plan — Plan progress in the prompt footer

## Approach

Decouple progress **calculation** from progress **rendering**:

1. `src/plans.js` exposes a pure `getPlanProgress()` that reads
   `task.md` once and returns `{ completed, total, ratio }` or `null`.
   The existing `renderPlanStatus()` is removed (its only caller is the
   agent loop, and after this change the loop no longer prints to stdout).
2. `src/ui/prompt-input-persistent.js` extends
   `buildPromptFooterSegments` to call `getPlanProgress()` and, when a
   non-null result is returned, push a styled `tasks: X/Y` segment into
   the footer. The idle prompt and the active-turn prompt both go
   through this helper, so the segment appears in both frames.
3. `src/agent/agent.js` removes the `renderPlanStatus()` call from the
   loop body. No new state, no new callback — the footer reads the file
   on the next repaint.
4. `features/plans-mode.md` updates the technical-details row and
   the change history.
5. `docs/visual-identity.md` records the new footer segment.
6. `CHANGELOG.md` records the change in `[Unreleased]` / `### Fixed`.

## Files to change

| File | Change |
|------|--------|
| `src/plans.js` | Add `getPlanProgress()`; remove `renderPlanStatus()`. |
| `src/agent/agent.js` | Remove `import { ..., renderPlanStatus }` and the `if (plansMode) renderPlanStatus();` call. |
| `src/ui/prompt-input-persistent.js` | Extend `buildPromptFooterSegments` to call `getPlanProgress()` and append a styled segment. |
| `features/plans-mode.md` | Update technical details and change history. |
| `docs/visual-identity.md` | Add a row about the `tasks:` footer segment under the prompt section. |
| `CHANGELOG.md` | Add `### Fixed` entry. |
| `specs/2026-09-02-plans-progress-footer/tasks.md` | Track progress. |

## Decisions

- The segment uses `C.warn` while the plan is incomplete and
  `C.success` when complete. Both palette tokens are already exported
  from `src/ui/theme.js` and used by other footer entries (`cache:` uses
  `C.success`, model uses `C.muted`).
- The `tasks:` segment is appended **after** the existing segments in
  the order: model/effort, tokens, cache, MCP, plans-progress. This keeps
  plans status adjacent to the other state tokens instead of pushing the
  model identifier further right.
- We re-read `task.md` on every footer build. The cost is one
  `fs.readFileSync` of a small text file; the function is called only
  on prompt redraw, which is bounded by keypress frequency and turn-end
  redraws. No measurable impact on the hot path.
- We do not add a new ADR; the change is a UX refinement, not an
  architectural decision.

## Verification

- `node --check` on every touched file.
- Manual test in a disposable workspace:
  1. Create a `task.md` with three open checkboxes.
  2. Start the CLI in plans mode.
  3. Confirm the footer reads `tasks: 0/3` (warning).
  4. Send a message that flips one checkbox in `task.md`.
  5. After the turn, the footer reads `tasks: 1/3`.
  6. Flip all three and confirm the segment turns to the success token.
  7. Delete `task.md` and confirm the segment disappears.
- `grep` for the old string `Plan Progress` in the chat-rendering
  surface to confirm the only remaining reference is in `CHANGELOG.md`
  (history) and `docs/` (documentation).
