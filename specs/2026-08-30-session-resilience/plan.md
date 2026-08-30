# Plan: Session summaries and tool checkpoints

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-30-session-resilience` |
| **Status** | `implemented` |

## 1. Technical Approach

Extend `history.js` with optional record metadata (`status`, `pendingToolCalls`) and a safe metadata reader while keeping `loadSession()`'s message-array return contract. Add `src/agent/session-summary.js` with a bounded, injectable summarizer and turn-count helper. The CLI maintains the completed-turn count, refreshes the title after agent completion, and passes checkpoint/final-save callbacks into the agent.

In `agent.js`, add an optional checkpoint callback invoked after the assistant message is appended and before execution. Save a complete checkpoint after each tool result. Export a narrow `resumePendingTools()` that validates pending calls, executes them through the existing `executeTool`, renders the normal tool summary and appends results; the CLI invokes it only when `history.js` reports `tool_pending`.

## 2. Architectural Compliance

- **Relevant ADR(s):** ADR-0001; no dependency or build-step change.
- **Architecture:** session metadata remains in `history.js`; summary logic remains in the agent domain; tool execution remains in `agent.js` and existing handlers.
- **Design system:** recovery and summary status use existing UI palette/activity functions.

## 3. Security and Threat Model

| Element | Handling |
|----------|------------|
| Command execution and whitelist | Recovery calls the same `executeTool`; no direct shell execution is added. |
| File writes and `resolveSafePath` | Checkpoint writes use the existing history path; recovered file tools go through current handlers. |
| LLM inputs (prompt injection / tool args) | Summary input is bounded to recent messages; pending calls require valid tool-call/function shape and still hit handler validation. |
| Secrets (API keys, sessions, exports) | Summaries are capped and never include configuration; no API key fields are passed to the summarizer. |
| Controls and negative tests | Test malformed metadata, duplicate result matching, summary failures, and checkpoint ordering. |

## 4. Impacted Modules

| Module | Path | Change |
|--------|---------|---------|
| Session persistence | `src/history.js` | Store/read checkpoint status and pending calls compatibly. |
| Summary helper | `src/agent/session-summary.js` | Count turns and perform bounded periodic summary completion. |
| Agent loop | `src/agent/agent.js` | Checkpoint before/after tools and expose safe recovery. |
| CLI | `src/cli.js`, `src/commands/handlers.js` | Save final state, refresh summary and resume loaded checkpoints. |
| Tests | `test/session-resilience.test.js` | Cover summary cadence, metadata and checkpoint ordering/recovery. |
| Documentation | `docs/architecture.md`, `IMPROVEMENTS.md`, `CHANGELOG.md` | Sync delivered behavior. |

## 5. Impacted Flags / Slash Commands / Tools

| Type | Name | Change |
|------|------|--------|
| Slash command | `/switch`, `/sessions`, `-H/--history` | Loaded sessions recover pending tool checkpoints before continuing. |
| Tools | Existing built-in/MCP tools | Reused unchanged through `executeTool`. |

## 6. Files to Create/Modify

| Action | Path (expected) | Notes |
|------|--------------------|-------------|
| Create | `src/agent/session-summary.js` | Periodic summary helper. |
| Create | `test/session-resilience.test.js` | Unit and callback ordering tests. |
| Modify | `src/history.js` | Optional metadata and status reader. |
| Modify | `src/agent/agent.js` | Checkpoint callbacks and pending-tool recovery. |
| Modify | `src/cli.js`, `src/commands/handlers.js` | Wire summary/checkpoint/recovery lifecycle. |
| Modify | `docs/architecture.md`, `IMPROVEMENTS.md`, `CHANGELOG.md` | Documentation sync. |

## 7. Technical Decisions

1. Keep `loadSession()` backward-compatible and expose status through `getSessionRecord()` rather than changing every caller.
2. Persist `pendingToolCalls` as the assistant tool-call objects and mark each completed result by `tool_call_id`; this makes recovery idempotent after a per-tool checkpoint.
3. Summaries use only recent session messages, are bounded to 120 characters, and failures keep the existing summary.

## 8. Verification Strategy and Gates

- AC-01–03: inject a fake completion and assert cadence, parameters and bounded result.
- AC-04–06: use fake checkpoint/save callbacks and malformed metadata fixtures; assert callback ordering and no unsafe execution.
- Run `node --check` on every touched JS file, `npm test`, `git diff --check`, and CLI smoke/manual recovery checks where MCP startup allows.
- No new dependency; `npm audit` is not applicable.

## 9. Git Workflow

| Item | Answer |
|--------|--------|
| **Feature branch** | `feat/session-resilience` |
| **Commit plan** | Implementation/tests first; docs/spec/backlog in a separate explicit commit. Never stage `tmp-fix-thinking.mjs`. |

## 10. Failures, Partial State and Rollback

| Topic | Strategy |
|------------|------------|
| Summary API failure | Keep the prior summary and continue the completed turn. |
| Recovery/tool failure | Persist the error result through the normal tool-result path; never repeat a call with a matching result. |
| Interruption | Checkpoint before tools and after each result; normal SIGINT lifecycle remains in the CLI. |
| Rollback | Revert feature commits; legacy records remain readable because metadata is optional. |

## 11. Technical Risks and Trade-offs

| Risk | Likelihood | Mitigation |
|-------|---------------|-----------|
| History record grows with pending call metadata | Low | Store only the current assistant tool-call batch and clear it on complete save. |
| Summary includes noisy tool output | Medium | Summarize recent bounded messages and instruct the model to focus on decisions/files/state. |
