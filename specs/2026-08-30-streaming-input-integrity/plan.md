# Plan: Streaming and multiline input integrity

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-30-streaming-input-integrity` |
| **Status** | `implemented` |

## 1. Technical Approach

Add a pure `getIncrementalText(previous, incoming)` helper to `src/agent/reasoning.js`. Use it for legacy reasoning fields in `agent.js` and inside `appendReasoningDetails()` so cumulative provider snapshots become suffixes while normal fragments remain unchanged. When both legacy and structured fields are present, retain the existing structured preservation path and avoid rendering the same visible fragment twice.

Refactor `prompt-input.js` and `thinking.js` redraws to build their ANSI/cursor output in a string and perform one `stdout.write()` per frame. Add a Shift+Enter branch before the plain Enter submit branch, inserting `\n` at the active cursor and reusing the existing wrap/cursor math.

## 2. Architectural Compliance

- **Relevant ADR(s):** ADR-0001; no stack or dependency change.
- **Architecture:** stream normalization remains in `src/agent/reasoning.js`; terminal rendering and input remain in `src/ui/`.
- **Design system:** use the existing `C` palette, wrapping and cleanup conventions.

## 3. Security and Threat Model

| Element | Handling |
|----------|------------|
| Command execution and whitelist | Not changed. |
| File writes and `resolveSafePath` | Not changed. |
| LLM inputs (prompt injection / tool args) | Reasoning is display/history data only; tool parsing remains untouched. |
| Secrets (API keys, sessions, exports) | Encrypted reasoning is never rendered; no credentials enter redraw buffers. |
| Controls and negative tests | Test cumulative/fragmented text, encrypted details, Shift+Enter, plain Enter behavior and cleanup at narrow width. |

## 4. Impacted Modules

| Module | Path | Change |
|--------|---------|---------|
| Reasoning normalization | `src/agent/reasoning.js` | Deduplicate cumulative and repeated structured text. |
| Agent stream | `src/agent/agent.js` | Append only normalized reasoning fragments. |
| Thinking UI | `src/ui/thinking.js` | Assemble redraw frames atomically. |
| Prompt UI | `src/ui/prompt-input.js` | Assemble redraw frames and handle Shift+Enter newline. |
| Tests | `test/reasoning.test.js`, new prompt/input tests as practical | Cover stream normalization and boundaries. |

## 5. Verification Strategy and Gates

- Run reasoning unit tests for cumulative snapshots, normal fragments, structured details and encrypted payloads.
- Exercise prompt input in a pseudo-TTY at 60 columns with ordinary typing, Shift+Enter, plain Enter, Esc and Ctrl+C; inspect that output has no duplicated rows/control leakage.
- Run `node --check` on all touched JS files, `npm test`, `npm run lint`, `git diff --check` and the CLI smoke command.

## 6. Git Workflow

| Item | Answer |
|--------|--------|
| **Feature branch** | `feat/model-system` for reasoning; `feat/ux-ui` is the canonical branch for prompt UI changes, but this fix stays together because the stream/input contract is one reported issue. |
| **Documentation branch** | `docs/documentation` |
| **Commit plan** | Source/tests on `feat/model-system`; spec, CHANGELOG, feature history and visual docs on `docs/documentation`. |
