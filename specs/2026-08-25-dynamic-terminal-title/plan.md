# Plan: Dynamic terminal title by runtime activity

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-25-dynamic-terminal-title` |
| **Status** | `implemented` |

---

## 1. Technical Approach

Create a stateful UI adapter in `src/ui/title.js` around pure helpers (`sanitizeTitlePart`, `formatTerminalTitle`, `describeToolActivity`). It emits OSC 0 only for a real TTY, suppresses duplicate titles and delegates control-byte removal to `src/ui/control.js`. CLI orchestration sets lifecycle states; `agent/agent.js` sets response/tool states in a `try/finally`; `agent/compression.js` owns the compression state because only it knows whether compression actually runs.

## 2. Architectural Compliance

- ADR-0001 remains unchanged: raw ANSI/OSC, pure ES modules, no new dependency.
- All title rendering lives in `ui/`; agent/CLI code invokes the UI contract only.
- No model-facing tool is added, so tool schemas, prompt cache stability and token use are unchanged.

## 3. Security and Threat Model

| Element | Handling |
|----------|----------|
| Command execution | State observation only; command text is never included. |
| File writes | Not applicable. |
| LLM inputs | Tool names/paths are untrusted; controls removed and output capped. |
| Secrets | Prompts, session summaries, command args and search queries are excluded. |
| Negative tests | OSC/CSI/BEL/CR stripping; runCommand/query redaction; length cap; non-TTY/dumb no-op predicate. |

## 4. Impacted Modules

| Module | Path | Change |
|--------|------|--------|
| Title UI | `src/ui/title.js`, `src/ui/index.js` | Formatting, state, emission and public API. |
| Agent loop | `src/agent/agent.js` | Thinking/responding/tool/fallback states and `finally` reset. |
| Compression | `src/agent/compression.js` | Compression activity when the gate runs. |
| CLI | `src/cli.js` | Startup/connection/waiting/session/model/shutdown states. |
| Tests | `test/title.test.js` | Pure formatting, security and tool-description checks. |

## 5. Impacted Flags / Slash Commands / Tools

No new flag, slash command or model-facing tool. Existing runtime events are observed automatically.

## 6. Files to Create/Modify

| Action | Path | Notes |
|--------|------|-------|
| Create | `src/ui/title.js`, `test/title.test.js` | Feature and focused tests. |
| Modify | `src/ui/index.js`, `src/agent/agent.js`, `src/agent/compression.js`, `src/cli.js` | Integration. |
| Modify | `README.md`, `docs/product.md`, `docs/architecture.md`, `docs/visual-identity.md`, `docs/code-quality-and-security.md`, `features/terminal-ui.md`, `CHANGELOG.md` | Documentation sync and existing feature registry update. |

## 7. Technical Decisions

The title is deterministic runtime UI, not an LLM tool. The stable identity uses workspace/model, not prompt text. Activity is placed first for visibility in narrow terminal tabs. Duplicate title writes are suppressed.

## 8. Verification Strategy and Gates

- `node --check` for every touched JS file.
- `node --test test/title.test.js test/rules.test.js` for regression/security.
- Focused pseudo-TTY emission check plus no-op predicate checks for non-TTY/dumb terminals.
- `node test-ui.js` and a direct networked `runAgent` smoke.
- Inspect Ctrl+C/reset paths and document that previous shell titles cannot be restored portably.

## 9. Git Workflow

| Item | Answer |
|------|--------|
| **Feature branch** | `feat/dynamic-terminal-title` |
| **Commit plan** | Spec artifacts; implementation/tests; docs/registry closeout. Explicit paths only. |

## 10. Failures, Partial State and Rollback

| Topic | Strategy |
|------|----------|
| Closed stdout / unsupported terminal | Best-effort write wrapped in `try`; no app crash. |
| Agent error | `finally` restores `waiting`. |
| Ctrl+C / normal exit | Clear transient activity to stable identity before shutdown. |
| Rollback | Remove UI adapter and integration calls; no persistent state exists. |

## 11. Technical Risks and Trade-offs

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| OSC support varies | Medium | Gate by TTY/TERM and fail silently. |
| Title remains after CLI exits | Medium | Reset to stable Emile identity; previous shell title is not discoverable. |
| Hidden data copied to title | Low | Allowlisted descriptions; exclude prompts and raw args. |
