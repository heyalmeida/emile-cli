# Plan — Persist per-session cost and token history

| Field | Value |
|-------|-------|
| **Spec** | `2026-09-03-session-cost-persistence` |
| **Status** | `implemented` |

## 1. Technical Approach

Add explicit snapshot/reset/restore helpers around the existing mutable `sessionStats` object. Persist only a fixed numeric usage schema in the existing session history record. The CLI owns active-session transitions: startup restores the selected record, `/switch` restores the selected record, `/new` resets, and every checkpoint/final save passes the current snapshot to `saveSession`.

Do not attempt to infer exact historical API usage for old records. They load with zero known usage and remain fully usable.

## 2. Architectural Compliance

- **ADR-0001:** plain ES modules and no new dependency/build step.
- **Architecture:** `session-stats.js` owns counters; `history.js` owns bounded metadata; `cli.js` owns active-session lifecycle; handlers call explicit context methods.
- **Product semantics:** `/cost` remains per active session, while message history and reasoning are unchanged.

## 3. Security and Threat Model

| Element | Handling |
|----------|----------|
| Session metadata | Fixed numeric fields only; no message/secret/reasoning content added. |
| Untrusted records | Restore accepts finite non-negative numbers and ignores malformed fields. |
| File writes | Existing session JSON write path only; no model tool or shell boundary changes. |
| Interruption | Checkpoint and final saves use the same snapshot; failure remains best-effort as before. |
| Negative tests | Switch A→B, new session reset, legacy record and malformed metadata. |

## 4. Impacted Modules

| Module | Path | Change |
|--------|------|--------|
| Stats | `src/agent/session-stats.js` | Snapshot/reset/restore helpers. |
| Agent barrel | `src/agent/index.js` | Export helpers. |
| History | `src/history.js` | Persist and return bounded `stats`. |
| CLI | `src/cli.js` | Load/restore/reset and pass snapshots on saves/context. |
| Session commands | `src/commands/handlers.js` | Restore on switch, reset on new. |
| Tests | `test/session-stats-persistence.test.js`, existing history/commands tests | Lifecycle and schema coverage. |

## 5. Impacted Flags / Slash Commands / Tools

| Type | Name | Change |
|------|------|--------|
| CLI flag | None | No new flag. |
| Slash command | `/switch`, `/new`, `/rewind`, `/cost` | Existing commands gain correct session-scoped state. |
| Tool | None | No tool contract change. |

## 6. Files to Create/Modify

| Action | Path | Notes |
|--------|------|-------|
| Modify | `src/agent/session-stats.js` | Add fixed-schema snapshot/restore/reset. |
| Modify | `src/agent/index.js` | Export helpers. |
| Modify | `src/history.js` | Preserve and return `stats`. |
| Modify | `src/cli.js` | Wire active-session lifecycle and save snapshots. |
| Modify | `src/commands/handlers.js` | Session switch/new behavior. |
| Create | `test/session-stats-persistence.test.js` | Isolated session lifecycle tests. |
| Create | `specs/2026-09-03-session-cost-persistence/{spec,plan,tasks}.md` | SDD record. |
| Modify | `docs/product.md`, `docs/architecture.md`, `CHANGELOG.md`, feature registry | Documentation sync. |

## 7. Technical Decisions

- Scope totals to one active session; no cross-session grand total is implied.
- Persist `promptTokens`, `completionTokens`, `cachedPromptTokens`, `totalCost`, `lastPromptTokens` and `lastCompletionTokens` under a versioned `stats` object.
- Reset cumulative counters on `/new`; restore only the selected session on `/switch`.
- Keep context-limit and pre-call estimate fields runtime-derived and recomputed by `initSessionStats`.

## 8. Verification Strategy and Gates

- `node --check` all touched JavaScript files.
- Run focused stats/history/command tests and existing session resilience tests.
- Run `npm test` and `npm run lint`; record the known Windows symlink/cwd limitations.
- Run a real session save/resume E2E if credentials are available, or a deterministic subprocess lifecycle when not.

## 9. Git Workflow

Keep the current branch and stage only explicit files; no branch operations.

## 10. Failures, Partial State and Rollback

A missing/invalid stats object is treated as zero known usage. Existing message persistence is independent, so removing the new metadata does not invalidate session records. Checkpoint save failures remain best-effort and do not affect the agent turn.

## 11. Technical Risks and Trade-offs

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Old history cannot show exact old cost | Certain | Load safely and document the limitation; do not invent usage. |
| Stats snapshot saved after a crash is one response behind | Low | Existing final/checkpoint lifecycle remains explicit. |
| Session switching shares mutable singleton | Medium | Centralize restore/reset and test transitions. |
