# Tasks: Streaming and multiline input integrity

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-30-streaming-input-integrity` |

## Phase 0 — Preparation

- [x] T0.1 — Read PRD, architecture, visual identity, security, glossary and active stream/input specs.
- [x] T0.2 — Create the approved spec and plan.
- [x] T0.3 — Classify medium risk and map provider snapshot/raw-mode boundaries.

## Phase 1 — Implementation

- [x] T1.1 — Normalize cumulative legacy reasoning snapshots and repeated structured detail text *(AC-01, AC-02)*.
- [x] T1.2 — Make thinking and input redraw frames atomic *(AC-03, AC-05)*.
- [x] T1.3 — Insert newlines on Shift+Enter while preserving plain Enter submit *(AC-04, AC-05)*.
- [x] T1.4 — Add regression tests for stream normalization and input boundaries *(AC-01–AC-05)*.

## Phase 2 — Verification

- [x] T2.1 — Run syntax checks, full tests, lint and diff check.
- [x] T2.2 — Run pseudo-TTY/manual interaction and CLI smoke tests.
- [x] T2.3 — Verify every acceptance criterion and record limitations.

## Phase 3 — Documentation and Closing

- [x] T3.1 — Sync CHANGELOG, feature registry and visual/architecture docs on `docs/documentation`.
- [x] T3.2 — Mark the spec implemented and record commit evidence.

## Acceptance Criteria Verification Log

| AC | Status | Evidence |
|----|--------|----------|
| AC-01 | ✅ | `test/agent-reasoning-stream.test.js`: cumulative legacy snapshots persist as `The user asks`; `getIncrementalText()` tests prefix, duplicate and overlap cases. |
| AC-02 | ✅ | `test/reasoning.test.js` and `test/agent-reasoning-stream.test.js`: repeated structured ids retain one complete block and render only the unseen suffix. |
| AC-03 | ✅ | `src/ui/prompt-input.js` and `src/ui/thinking.js` assemble cursor/ANSI frames and call `stdout.write()` once per redraw; full suite passed. |
| AC-04 | ✅ | `test/prompt-input.test.js` covers readline, Kitty and modifyOtherKeys encodings; pseudo-TTY manual test returned `abc\ndef` after Shift+Enter. |
| AC-05 | ✅ | Pseudo-TTY prompt interaction was exercised at narrow width with ordinary input, multiline input and cleanup; Esc clears drafts, and syntax/tests passed. The full CLI smoke reached startup but timed out while the configured external MCP example server was connecting. |

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| `4efd34c` | `fix(ui): preserve monotonic streamed reasoning` | Source and regression tests on `feat/model-system` |
| This commit | `docs: sync streaming and input integrity` | Spec, CHANGELOG, feature registry and product/UI/architecture docs on `docs/documentation` |
