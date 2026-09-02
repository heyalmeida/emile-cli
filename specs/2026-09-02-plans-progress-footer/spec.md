# Spec: Plan progress in the prompt footer

| Field | Value |
|-------|-------|
| **ID** | `2026-09-02-plans-progress-footer` |
| **Status** | `draft` |
| **Phase/Context** | Plans mode UX / REPL footer |
| **Related documents** | [PRD](../../docs/product.md), [Architecture](../../docs/architecture.md), [Visual identity](../../docs/visual-identity.md), [Feature: plans mode](../../features/plans-mode.md), [Spec 2026-08-30-plans-compression-resilience](../../specs/2026-08-30-plans-compression-resilience/spec.md) |

## 1. Problem / Motivation

While the agent is running in Plans mode it edits `task.md` (`- [ ]` → `- [x]`)
as it completes each task. After every loop iteration, the agent loop calls
`renderPlanStatus()` (`src/plans.js:70`), which writes a new line
`   Plan Progress: 1/5 tasks completed` to stdout. The line accumulates
in the chat, the same message is replayed each time the loop iterates, and
the user reads the same information repeatedly while typing.

## 2. Goal

Show the same progress information **once**, in a fixed location that the
user already consults while typing: the prompt footer. The line must be
visible both while the prompt is idle and while the agent is working
(active turn). The chat history stays free of the repeating line.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-----------|--------------------|
| RF-S01 | When `config.plansMode` is true and `task.md` exists, the prompt footer MUST show the segment `tasks: X/Y` where `X` is the count of `- [x]` checkboxes and `Y` is the count of `- [ ]`, `- [x]` and `- [/]` checkboxes combined. | Must |
| RF-S02 | The segment MUST be visible in the idle prompt frame and the active-turn frame. | Must |
| RF-S03 | When `task.md` does not exist or contains zero checkboxes, the segment MUST NOT be rendered. | Must |
| RF-S04 | When all checkboxes are completed (`X === Y && Y > 0`), the segment MUST be rendered with the success palette token (`C.success`). | Must |
| RF-S05 | When at least one checkbox remains open, the segment MUST be rendered with the warning palette token (`C.warn`). | Must |
| RF-S06 | The agent loop MUST stop writing the per-iteration "Plan Progress" line to stdout. | Must |
| RF-S07 | The footer line MUST remain clipped to terminal width (reusing the existing `clipLine` logic in `buildPromptLayout`). | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|--------|
| **Risk classification** | Low — changes only where a derived value is displayed; no new tool, command, or model call is introduced. |
| **Assets/secrets** | None. The footer only reads the local `task.md`. |
| **Command execution / file writes** | None. The agent loop loses one `console.log` call and gains nothing else. |
| **Untrusted inputs** | `task.md` is treated as user/agent output (consistent with existing `getTaskChecklist`). No new trust boundary. |
| **Negative criteria** | No extra disk read on the hot path of every agent stream chunk; reading `task.md` happens only on prompt redraw (keypress or turn-end). No new public CLI flag. |

## 5. Out of Scope

- Showing per-task titles in the footer.
- Live-tailing `task.md` for changes outside prompt redraws.
- Changing the Plans approval flow or the file format of `task.md`.
- Animating the progress counter or adding a progress bar.

## 6. Acceptance Criteria

- **AC-01:** Given a `task.md` with 5 checkboxes (3 done, 2 open), the prompt footer shows `tasks: 3/5` in the warning token.
- **AC-02:** Given a `task.md` with all checkboxes marked `- [x]`, the footer shows `tasks: N/N` in the success token.
- **AC-03:** Given no `task.md` or a `task.md` with zero checkboxes, the footer does not contain a `tasks:` segment.
- **AC-04:** Given the agent is mid-turn and writes a new `- [x]` to `task.md`, the next prompt redraw reflects the new count without restarting the CLI.
- **AC-05:** Given the previous behaviour (loop printing `Plan Progress:` to stdout on every iteration), the new code does not produce that line in the chat history.
- **AC-06:** `node --check` passes on every touched JS file, and the `npm test` run keeps the existing test surface green.

## 7. References

- `src/plans.js` (`renderPlanStatus`, `getTaskChecklist`)
- `src/agent/agent.js:611` (caller of `renderPlanStatus`)
- `src/ui/prompt-input-persistent.js` (`buildPromptFooterSegments`, `buildPromptLayout`)
- `src/ui/turn-keys.js` (uses `buildPromptFooterSegments` for the active-turn frame)
- `docs/visual-identity.md` (footer styling and palette)
