# Plan: Turn interrupt, queue and persistent prompt regression follow-up

| Field | Value |
|-------|-------|
| **Spec** | `2026-09-01-turn-interrupt-queue` |
| **Status** | `implemented` |

---

## 1. Technical Approach

Share the pure full-prompt layout, footer and slash-command match builders
between the idle REPL and `listenTurnKeys`, while transferring stdin ownership
explicitly whenever an async submit opens an active turn or nested raw-mode
surface. The persistent prompt suspends its listener until the async submission
finishes, then reacquires raw mode, resumes stdin and redraws. The active-turn
owner renders the standard prompt frame and implements the same autocomplete
navigation/completion contract without attaching a second key listener. While
that owner is active, it temporarily arbitrates stdout writes: erase the frame,
restore the saved agent-output cursor, forward the write, save the new output
cursor, redraw the frame, and leave the real cursor at the draft caret.

## 2. Architectural Compliance

- **ADR-0001:** preserved — plain ES modules, raw ANSI and no dependency/build change.
- **ADR-0003:** active turns temporarily arbitrate stdout, restore the preceding writer on cleanup and keep the real caret in the shared full prompt.
- **Architecture:** interaction stays inside `src/ui/`; `src/cli.js` only orchestrates ownership and queue draining.
- **Design system:** `buildPromptLayout` and the `C` palette are authoritative for idle and active turns; the autocomplete selection uses `●`, reserving `❯` for the actual input row.

## 3. Security and Threat Model

| Element | Handling |
|----------|----------|
| Command execution and whitelist | Not applicable; tool execution and gates are unchanged. |
| File writes and `resolveSafePath` | Not applicable; no file handler changes. |
| LLM inputs | Submitted and queued text follows the existing prompt/queue boundary; no new trust decision. |
| Secrets | No credentials, session bodies or provider errors are newly rendered. |
| Controls and negative tests | Prove exclusive key ownership during `/switch`, stdin resume afterward, Tab fallback behavior, queue order and Esc/Ctrl+C cleanup. |

## 4. Impacted Modules

| Module | Path | Change |
|--------|------|--------|
| Persistent prompt | `src/ui/prompt-input-persistent.js` | Suspend/resume key ownership, Tab completion, draft cancel and prompt handle. |
| Active-turn prompt | `src/ui/turn-keys.js` | Render the shared full frame and apply the same autocomplete contract while retaining turn cancel/queue ownership. |
| Spinner | `src/ui/spinner.js` | Emit each animation frame atomically so one tick causes one prompt-preserving redraw. |
| REPL orchestration | `src/cli.js` | Await submissions, hand active turns to `listenTurnKeys`, then drain queued lines sequentially. |
| UI barrel | `src/ui/index.js` | Preserve the persistent prompt export. |
| Regression tests | `test/prompt-input-render.test.js` | Cover Tab and nested `/switch` lifecycle. |
| Active-turn render tests | `test/turn-keys-visibility.test.js` | Cover full-frame parity, distinct selection marker and active autocomplete. |
| Queue tests | `test/persistent-queue.test.js` | Cover sequential busy submissions and commands. |

## 5. Impacted Flags / Slash Commands / Tools

| Type | Name | Change |
|------|------|--------|
| Keyboard | `Tab` | Accept autocomplete when available; otherwise toggle Plans mode. |
| Slash command | `/switch` / `/sessions` | Restore prompt ownership after the picker closes. |
| Keyboard | `Esc` / `Ctrl+C` | Preserve documented draft/turn cleanup semantics. |

## 6. Files to Create/Modify

| Action | Path (expected) | Notes |
|--------|-----------------|-------|
| Modify | `src/ui/prompt-input-persistent.js` | Centralize stdin attach/detach and raw-mode restoration. |
| Modify | `src/ui/turn-keys.js` | Reuse the full layout/footer/matches during an active turn. |
| Modify | `src/ui/spinner.js` | Collapse multi-write animation frames into atomic writes. |
| Modify | `src/cli.js` | Serialize idle prompt and active-turn listener ownership. |
| Modify | `test/prompt-input-render.test.js` | ANSI-emulator regressions at narrow/default widths. |
| Modify | `test/turn-keys-visibility.test.js` | Active full-frame and autocomplete regressions. |
| Modify | `test/persistent-queue.test.js` | Queue ordering regression. |
| Modify | `specs/2026-09-01-turn-interrupt-queue/*` | Scope, plan, tasks and evidence. |
| Modify | `CHANGELOG.md`, `features/agent-loop.md` | Documentation sync after verification. |

## 7. Technical Decisions (summary)

There must be only one keypress consumer at a time. The idle prompt and nested
pickers never overlap; the idle prompt and `listenTurnKeys` also never overlap.
This is a lifecycle correction to the accepted architecture, not a new ADR.

## 8. Verification Strategy and Gates

- AC-04: automated queue-order test plus active full-frame visibility tests.
- AC-06: keypress regression checks both autocomplete acceptance and Plans-mode fallback.
- AC-07: run the real `promptSwitchSession` under the prompt test terminal, then type after it resolves.
- Run `node --check` for every touched JS file, focused `node:test` files, full `npm test`, `npm run lint`, and a PTY smoke at 60/80/120 columns where credentials/provider access are not required.
- Record any live-provider smoke not executed and why.

## 9. Git Workflow

| Item | Answer |
|------|--------|
| **Feature branch** | `fix/persistent-prompt-input`; unrelated staged site/web work remains preserved and excluded by explicit pathspec. |
| **Documentation branch** | `docs/documentation` for spec, CHANGELOG and feature registry. |
| **Commit plan** | Code/tests on the product branch and docs separately; stage only explicit paths. If the existing dirty worktree prevents a safe switch, do not disturb unrelated changes and report the branch/commit limitation. |

## 10. Failures, Partial State and Rollback

| Topic | Strategy |
|-------|----------|
| Error handling and user-facing messages | Reattach the prompt in both fulfillment and rejection paths of async submissions. |
| Interruption (Ctrl+C / Esc) and readline state | The current owner removes its listener, restores raw mode, and only pauses stdin when no previous interactive owner needs it. |
| Partial state | Queue remains FIFO and messages are finalized through the existing session path. |
| Rollback / undo | Revert the prompt/CLI lifecycle patch; no persisted data migration exists. |

## 11. Technical Risks and Trade-offs

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Two listeners consume the same Enter | High without fix | Detach the persistent listener before awaiting nested interaction; regression-test listener ownership. |
| Nested picker pauses stdin | High (observed) | Reacquire raw mode and call `resume()` before reattaching the prompt. |
| Prompt output collides with agent stream | Medium | Temporarily arbitrate stdout during the active turn: hide the frame, restore/advance the agent cursor, then redraw and place the real cursor at the draft caret. Always restore the original writer in cleanup. |
