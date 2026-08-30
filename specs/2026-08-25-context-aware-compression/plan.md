# Plan: Context-aware history compression

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-25-context-aware-compression` |
| **Status** | `implemented` |

---

## 1. Technical Approach

Move the compression decision from paid/free raw-character constants to an
80%-of-context token boundary. `agent/agent.js` will build the same payload
inputs used for the API request, calculate their pre-call token estimate, and
pass both the estimate and `getContextLimit(model)` to `compression.js`.

`compression.js` will validate the supplied numbers, fall back to
`getModelInfo(model)` plus `JSON.stringify(messages).length / 4` for direct
callers, retain the existing split/summarization behavior, and track the
post-compression raw history size in a `WeakMap` keyed by the message list. A
subsequent attempt requires more than 40% history growth.

`session-stats.js` will skip only the first system message already represented
by `systemPrompt`; compressed or otherwise secondary system messages remain
part of the payload estimate.

## 2. Architectural Compliance

- **Relevant ADR(s):** ADR-0001 remains satisfied: pure ES modules, Node.js,
  existing OpenAI-compatible client and no build step or dependency change.
- **Architecture document:** responsibilities remain in their current modules:
  `session-stats.js` measures payload context, `compression.js` owns the gate,
  and `agent.js` orchestrates their order. The agent-loop documentation will be
  synchronized.
- **Design system:** no visual component changes. Existing compression status
  rendering and terminal-title activity remain unchanged.

## 3. Security and Threat Model

| Element | Handling |
|---------|----------|
| Command execution and whitelist | Not applicable; no command path is changed. |
| File writes and `resolveSafePath` | Not applicable; no file operation is changed. |
| LLM inputs (prompt injection / tool args) | Existing history continues to be sent only to the configured summarization model. The change affects when, not what, is sent. |
| Secrets (API keys, sessions, exports) | No credential, persistence, export or logging changes. |
| Controls and negative tests | Verify no early 1M-model compression, the 80% boundary, the message-count guard, post-compression hysteresis and non-fatal retry after failure. |

## 4. Impacted Modules

| Module | Path | Change |
|--------|------|--------|
| Compression gate | `src/agent/compression.js` | Context-window token threshold, numeric fallbacks and per-history hysteresis. |
| Agent loop | `src/agent/agent.js` | Build the payload estimate before the gate and recompute it after compression. |
| Context math | `src/agent/session-stats.js` | Count secondary system messages in the payload estimate. |
| Tests | `test/compression.test.js`, `test/title.test.js` | Boundary/regression suite and updated title integration setup. |

## 5. Impacted Flags / Slash Commands / Tools

| Type | Name | Change |
|------|------|--------|
| CLI flag | None | No new or changed flag. |
| Slash command | None | No new or changed slash command. |
| Tool | None | No tool contract change. |
| MCP | None | No MCP change. |

## 6. Files to Create/Modify

| Action | Path (expected) | Notes |
|--------|-----------------|-------|
| Create | `test/compression.test.js` | Focused automated regression coverage. |
| Modify | `src/agent/compression.js` | Replace fixed thresholds and add hysteresis. |
| Modify | `src/agent/agent.js` | Pass full-payload estimate and model context. |
| Modify | `src/agent/session-stats.js` | Include secondary system messages in estimates. |
| Modify | `test/title.test.js` | Make the compression-title test cross the token boundary explicitly. |
| Modify | `docs/product.md`, `docs/architecture.md`, `docs/code-quality-and-security.md`, `docs/glossary.md`, `docs/roadmap.md`, `README.md`, `CHANGELOG.md` | Rule 2 synchronization. |
| Modify | `features/model-system.md`, `features/README.md` | Existing feature registry and source-spec index. |

## 7. Technical Decisions (summary)

- Use a fixed 80% ratio to leave a 20% reserve for estimator error and output,
  without adding configuration surface.
- Use the existing factor of four characters per token for fallback estimates;
  no tokenizer dependency is introduced.
- Track hysteresis in a `WeakMap` keyed by the live message array, preventing
  cross-session leakage and allowing garbage collection.
- No ADR is required because no stack, dependency, external contract or durable
  architectural boundary changes.

## 8. Verification Strategy and Gates

| AC | Verification |
|----|--------------|
| AC-01 | Automated test with >8 messages, 50k estimated tokens and 1,048,576-token window; completion spy remains unused. |
| AC-02 | Automated tests immediately below and exactly at the 80% boundary. |
| AC-03 | Automated fallback-estimate test with a static 1M model and raw history that exceeded the old 120k-character gate; direct context-math assertion for a secondary system message. |
| AC-04 | Automated same-array tests below and above 40% post-compression growth. |
| AC-05 | Automated throwing summarizer followed by a successful retry. |

Run `node --check` on touched JavaScript files, `node --test
test/compression.test.js test/title.test.js`, the complete `node --test test/*.test.js`
suite, and the mandated `node bin/emile.js --verbose` smoke test. The smoke test
may be recorded as blocked if it requires interactive credentials/network; its
actual output must be reported.

## 9. Git Workflow

| Item | Answer |
|------|--------|
| **Feature branch** | `fix/context-aware-compression`, based on the current integrated feature line because the reported dynamic model catalog and decomposed `agent/` module do not exist on local `main`. |
| **Commit plan** | Spec/plan/tasks; code and tests; documentation/verification. Stage explicit paths only and preserve pre-existing workspace changes. |

## 10. Failures, Partial State and Rollback

| Topic | Strategy |
|-------|----------|
| Error handling and user-facing messages | Preserve the existing warning and continue the uncompressed turn. |
| Interruption (Ctrl+C / Esc) and readline state | No input/readline behavior changes; compression remains awaited at the same turn boundary. |
| Partial state (session, undo stack, file cache) | Only mutate `messages` after a successful summary; record hysteresis after that mutation. |
| Rollback / undo | Reverting the focused implementation commit restores the fixed paid/free thresholds. |

## 11. Technical Risks and Trade-offs

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Estimate undercounts dense content. | Medium | 20% reserve and boundary tests. |
| Estimate overcounts sparse content. | Low | Compression still occurs far closer to the real model window than the old fixed thresholds. |
| Payload estimate becomes stale after compression. | Medium | Recalculate immediately after successful compression before updating session telemetry. |
