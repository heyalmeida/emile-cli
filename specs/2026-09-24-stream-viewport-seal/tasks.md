# Tasks: Seal streamed frames when the viewport cannot be redrawn

| Field | Value |
|-------|-------|
| **Spec** | `2026-09-24-stream-viewport-seal` |

## Phase 0 — Preparation

- [x] T0.1 — Read the relevant PRD, architecture, visual identity, quality/security, glossary, ADR and existing streaming specs.
- [x] T0.2 — Confirm the scope as a medium-risk renderer fix and preserve unrelated working-tree changes.
- [x] T0.3 — Create the spec, plan and task record.

## Phase 1 — Implementation

- [x] T1.1 — Add TTY/viewport detection and sealed append-only rendering to `src/ui/response.js` *(verifies AC-02, AC-03)*.
- [x] T1.2 — Flush the final response line and keep box finalization single-shot *(verifies AC-02, AC-03)*.
- [x] T1.3 — Add the equivalent sealed behavior to expanded `src/ui/thinking.js` *(verifies AC-04)*.
- [x] T1.4 — Preserve established redraw behavior when TTY rows are unknown *(verifies AC-01, AC-04)*.

## Phase 2 — Testing and Verification

- [x] T2.1 — Focused tests passed: 17/17, including non-TTY, viewport overflow, stream dedup and active-turn prompt arbitration. Command: `node --test test/live-response-stream.test.js test/live-stream-overflow.test.js test/stream-dedup.test.js test/reasoning.test.js test/thinking-during-active-turn.test.js`.
- [x] T2.2 — Full suite completed: 252 passed, 6 failed, 2 skipped. The six failures are existing Windows symlink/security-platform cases. The earlier active-turn thinking regression was fixed by preserving redraw behavior when TTY row count is unknown; the focused rerun passed 17/17.
- [x] T2.3 — Syntax checks passed for all touched source/test files; `npm run lint` completed with 0 errors and existing warnings only. No new dependency was added.
- [x] T2.4 — Verify all acceptance criteria from the evidence above.

## Phase 3 — Documentation and Closing

- [x] T3.1 — Sync architecture, visual identity, product requirements, feature registry and CHANGELOG.
- [x] T3.2 — Mark the spec/plan implemented after verification.
- [x] T3.3 — Record the residual platform risk and the unrelated working-tree changes in the handoff.

## Acceptance Criteria Verification Log

| AC | Status | Evidence |
|----|--------|----------|
| AC-01 | ✅ | Existing progressive test uses a simulated TTY; focused suite passes. |
| AC-02 | ✅ | `live-stream-overflow.test.js` non-TTY regression asserts one marker occurrence and final flush. |
| AC-03 | ✅ | `live-stream-overflow.test.js` short-viewport TTY regression asserts one marker occurrence and final flush. |
| AC-04 | ✅ | `thinking-during-active-turn.test.js` passes with the row-count fallback. |
| AC-05 | ✅ | Focused tests and full suite were executed; platform-only failures are reported separately. |

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| — | Not created automatically | — |
