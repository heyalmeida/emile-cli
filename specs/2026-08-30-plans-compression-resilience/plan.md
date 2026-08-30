# Plan: Preflight Plans approval and compression fallback

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-30-plans-compression-resilience` |
| **Status** | `implemented` |

## 1. Technical Approach

Move the first-turn Plans approval in `agent.js` to the top of the loop, before the spinner/API call. Extend `promptPlanApproval` to accept a bounded task preview while retaining the existing clack confirmation. On approval, append the existing instruction and continue; remove the late post-response approval block.

Add a pure-ish `hardTruncateHistory` helper in `compression.js` that groups messages by user turn, removes oldest groups while the serialized payload exceeds 70% of the model context, and preserves the primary system message. Invoke it from the summarization catch and record the hysteresis size when it succeeds.

## 2. Architectural Compliance

- **Relevant ADR(s):** ADR-0001; no dependency or stack change.
- **Architecture:** approval remains in `plans.js` and loop policy in `agent.js`; compression remains in `agent/compression.js`.
- **Security:** tool execution continues through existing handlers and plans files are still gated by explicit approval.

## 3. Security and Threat Model

| Element | Handling |
|----------|------------|
| Command execution and whitelist | No new command path; early approval prevents tools before consent. |
| File writes and `resolveSafePath` | Compression does not write workspace files; plan files use existing gates. |
| LLM inputs (prompt injection / tool args) | Preview is bounded user text; no tool arguments are derived from it. |
| Secrets (API keys, sessions, exports) | Preview excludes history and is capped; no credentials are logged. |
| Controls and negative tests | Rejected approval has zero API calls; fallback tests assert system/latest-history preservation. |

## 4. Impacted Modules

| Module | Path | Change |
|--------|---------|---------|
| Plans UI | `src/plans.js` | Preview-aware approval prompt. |
| Agent loop | `src/agent/agent.js` | Preflight approval and removal of late gate. |
| Compression | `src/agent/compression.js` | 70% hard-truncation fallback. |
| Tests | `test/plans-compression.test.js`, `test/compression.test.js` | Approval/fallback regression coverage. |
| Documentation | `docs/architecture.md`, `docs/product.md`, `IMPROVEMENTS.md`, `CHANGELOG.md` | Sync behavior. |

## 5. Files to Create/Modify

| Action | Path (expected) | Notes |
|------|--------------------|-------------|
| Create | `test/plans-compression.test.js` | Pure approval helper checks and fallback boundaries. |
| Modify | `src/plans.js`, `src/agent/agent.js`, `src/agent/compression.js` | Implementation. |
| Modify | `test/compression.test.js` | Update failure semantics. |
| Modify | `docs/architecture.md`, `docs/product.md`, `IMPROVEMENTS.md`, `CHANGELOG.md` | Documentation sync. |

## 6. Verification Strategy and Gates

- AC-01–03: inject/test approval callback and inspect agent ordering; manual Plans run where credentials exist.
- AC-04–06: compression fixtures with thrown summarizer, small target context and malformed/low-history boundaries.
- Run `node --check` on touched JS files, `npm test`, `git diff --check`, and CLI smoke path where MCP startup permits.
- No new dependency; `npm audit` is not applicable.

## 7. Git Workflow

| Item | Answer |
|--------|--------|
| **Feature branch** | `fix/plans-compression-resilience` |
| **Commit plan** | Implementation/tests first; docs/spec/backlog in a separate explicit commit. Never stage `tmp-fix-thinking.mjs`. |
