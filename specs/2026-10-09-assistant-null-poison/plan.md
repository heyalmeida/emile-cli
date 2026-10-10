# Plan: Never create, persist or resume an assistant message without content or tool_calls

> Filled from the approved `spec.md`. The design is fixed by brief P0-6 and is
> not re-derived here; this document records how it lands.

| Field | Value |
|-------|-------|
| **Spec** | `2026-10-09-assistant-null-poison` |
| **Status** | `implemented` |

---

## 1. Technical Approach

One predicate, three enforcement points, plus the dead-flag fix.

1. **`history.js` — the single source of truth.**

   ```js
   export function isValidAssistantMessage(message) {
     if (!message || typeof message !== 'object') return true;   // not ours to judge
     if (message.role !== 'assistant') return true;              // other roles untouched
     const hasToolCalls = Array.isArray(message.tool_calls) && message.tool_calls.length > 0;
     const hasContent = typeof message.content === 'string'
       ? message.content.length > 0
       : message.content !== null && message.content !== undefined;
     return hasContent || hasToolCalls;
   }
   ```

   False **only** for the empty-and-unpaired shape. `content: null` + `tool_calls`
   is valid (F7), non-string content (multimodal arrays) is valid, and every
   non-assistant role passes through untouched.

2. **`history.js` — persist guard.** `preparePersistedMessages` ends with
   `.filter(isValidAssistantMessage)` after the existing projection map. Because
   `trimPersistedMessages` composes on top of it, `saveSession` — and therefore
   `finalizeSessionTurn`, `resumeLoadedSession`'s saves and the
   `tool_pending` checkpoints — are all covered by that one line (RF-S04).
   `getSessionRecord` filters `Array.isArray(data.messages) ? data.messages : []`
   with the same predicate on read (RF-S05), so `loadSession` (which delegates to
   it) is covered too. **No write to disk happens at load** (RF-S06): the file is
   only rewritten by the next `saveSession`, which persists the clean projection.
   The load filter is observable (a counter warning is emitted when it drops
   something) so the user knows their transcript self-healed.

3. **`agent.js` — generation guard.** `import { isValidAssistantMessage } from
   '../history.js'`, then:
   - normal path: `if (isValidAssistantMessage(assistantMessage)) messages.push(assistantMessage);`
     at `:664` (RF-S02). The `executableToolCalls.length > 0` branch below it is
     unreachable when the predicate fails (valid tool calls imply `tool_calls`,
     which imply validity), so tool batches keep flowing exactly as before.
   - cancel path: the push inside the `else` at `:658` gets the same guard
     (RF-S03); the "partial response kept" notice stays as-is so semantics do
     not drift beyond the guard.
   - stream `catch`: `streamErrored = true;` (RF-S09, F5) — kills the duplicate
     "· (empty response)" line while keeping the real "✗ Stream error" notice.

   **No dependency is introduced by the import:** `src/cli.js` already wires
   `history.js` into the agent session, and the barrel-free `agent.js → history.js`
   edge adds no cycle (`history.js` imports `config.js`, `ui/log.js`,
   `tools/security.js`, `memory/constants.js` — never `agent/`).

4. **Nothing else changes** — retry/fallback/forced-compression, checkpoint
   shape, tool-pairing placeholders, `client.js` statuses and compression
   splitting stay as they are.

## 2. Architectural Compliance

- **Relevant ADR(s):** ADR-0001 (pure ESM, no dependency) — respected.
  ADR-0002 (quality gates) — new dedicated test file + standard gates.
  ADR-0003 (active prompt arbitration) — not implicated; the only stdout change
  is removing one duplicate notice line.
- **Architecture document:** `docs/architecture.md` keeps `agent/` responsible
  for the loop and `history.js` for persistence; the predicate lives in the
  persistence module because that is where the session contract is defined, and
  the agent imports it. One sentence in the `history.js` row records the
  invariant (Rule 2). No new ADR: no boundary or stack change.
- **Visual identity:** the change removes a duplicated line; `· (empty response)`
  and `✗ Stream error` keep their existing wording and tone.

## 3. Security and Threat Model

| Element | Handling |
|----------|------------|
| Command execution and whitelist | Not applicable — no tool gate touched. |
| File writes and `resolveSafePath` | `saveSession` unchanged (same file, same path logic). Load-time sanitization performs **no** write (RF-S06). |
| LLM inputs (prompt injection / tool args) | The provider stream is untrusted: an error/empty payload can no longer shape history. The predicate rejects the invalid record before it becomes a request payload. |
| Secrets (API keys, sessions, exports) | Nothing new is persisted or printed; the load-time warning names only a count, never message content. |
| Controls and negative criteria | AC-01/02/03 are the "poison must not appear" checks; AC-04 is the negative check that a valid `content:null`+`tool_calls` message is never dropped; AC-07 reproduces the provider-side 400 to prove the loop is closed; AC-05 pins the notice change. |

## 4. Impacted Modules

| Module | Path | Change |
|--------|---------|---------|
| Agent loop | `src/agent/agent.js` | generation + cancel push guards; `streamErrored = true`; one new import. |
| Session persistence | `src/history.js` | new exported `isValidAssistantMessage`; persist filter; load filter (+ observable warning). |
| Tests | `test/history-sanitize.test.js` | new: predicate matrix, persist, load, integration, 400-emulation, double-notice. |
| Consumers (read-only) | `src/cli.js` | unchanged — `finalizeSessionTurn`/`resumeLoadedSession` benefit automatically. |

## 5. Impacted Flags / Slash Commands / Tools

| Type | Name | Change |
|------|------|--------|
| CLI flag | — | none |
| Slash command | `/resume`, `/rewind` | behavior only: resuming a poisoned session now yields a clean message list |
| Tool | — | none |
| MCP | — | none |

## 6. Files to Create/Modify

| Action | Path | Notes |
|------|--------|-------------|
| Create | `specs/2026-10-09-assistant-null-poison/spec.md` | this spec |
| Create | `specs/2026-10-09-assistant-null-poison/plan.md` | this plan |
| Create | `specs/2026-10-09-assistant-null-poison/tasks.md` | tasks + verification log |
| Create | `test/history-sanitize.test.js` | unit + integration |
| Modify | `src/history.js` | predicate + two filters + warning |
| Modify | `src/agent/agent.js` | guards + dead flag + import |
| Modify | `CHANGELOG.md` | `[Unreleased] → Fixed` |
| Modify | `docs/deep-dive.md` | § 21.1 P0-6 applied, § 10 invariant note, § 22.3 compaction row note |
| Modify | `docs/architecture.md` | `history.js` row: the invariant |
| Modify | `features/session-lifecycle.md`, `features/agent-loop.md` | Change History rows (Rule 7.4) |

## 7. Technical Decisions (summary)

1. **Predicate exported from `history.js`, imported by `agent.js`** (the brief's
   "one predicate for all three sites"). `history.js` is the lowest module that
   owns the session shape; it imports nothing from `agent/`, so no cycle.
2. **Sanitize at persist *and* at load, guard at generation** — belt and braces
   on purpose: generation alone would not self-heal existing files; load alone
   would keep re-poisoning disk each turn.
3. **Load filter is read-only** (RF-S06): rewriting files in place would fight
   with another session's in-flight data and is explicitly forbidden.
4. **Non-object entries return `true`** rather than `false`: the predicate's job
   is to name one invalid *assistant* shape, not to become a general history
   validator; a garbage entry must not be silently deleted at persist time.
5. **A warning when the load filter drops something** — Rule 6.1 forbids
   swallowing problems silently, and the user's transcript visibly shortens.
6. **Cancel-path notice unchanged** — only the push is guarded, so
   `test/turn-interrupt.test.js` semantics hold.
7. **`streamErrored` is set inside the `catch`, not at the notice site**, so the
   flag means exactly what its name says and the existing `!streamCanceled`
   guard composition stays intact.

## 8. Verification Strategy and Gates

| AC | Check |
|----|---------|
| AC-01 / AC-02 | Integration tests driving the real `runAgent` with a completion that throws after zero chunks, and one that yields reasoning deltas then throws: assert no invalid assistant in the returned array **and** none in the file written by a capturing `checkpointSession`/`saveSession` path. |
| AC-03 / AC-08 | Fixture session JSON with the user's exact pattern written into a temp `.emile/history`; `getSessionRecord` → zero invalid assistants; then `runAgent` over those messages with a 400-emulating completion that *rejects* any assistant lacking content/tool_calls, asserting the turn completes and a second turn also completes. |
| AC-04 | Unit + persist + load assertions that `{content:null, tool_calls:[…]]}` survives all three sites; plus `test/session-resilience.test.js` (checkpoint) and `test/api-transports.test.js` unchanged. |
| AC-05 | stdout capture: contains `Stream error`, does not contain `empty response`; plus the pre-existing `test/empty-stream-line.test.js` cases stay green (the notice must still appear for a real empty stream). |
| AC-06 | Predicate matrix (incl. multimodal array content, `user`/`tool` roles, non-object entries, `tool_calls: []`). |
| AC-07 | The 400-emulating completion is the executable version of the poison loop. |
| AC-09 | `node --check src/agent/agent.js src/history.js`, `node --test test/history-sanitize.test.js`, `npm run lint`, `npm test` on Windows. |
| AC-10 | Docs diff review + Rule 5 table/Mermaid revalidation. |

Commands (Rule 6.3): `node --check src/agent/agent.js src/history.js`;
`node --test test/history-sanitize.test.js`; `npm run lint`; `npm test`. Smoke:
the interactive `node bin/emile.js --verbose` path needs a live provider, so the
400-emulating integration test stands in; recorded in `tasks.md`.

## 9. Git Workflow

| Item | Answer |
|------|--------|
| **Working branch** | `development` — confirmed by `git branch --show-current`; no switch/branch/worktree (Rule 8). |
| **Commit plan** | One coherent unit on `development`: spec pack + code + tests + docs, staged with explicit paths (never `git add .`/`-A`). Working tree is clean at start; any foreign in-flight change is left untouched and unstaged. |

## 10. Failures, Partial State and Rollback

| Topic | Strategy |
|------|------------|
| Error handling and user-facing messages | "Stream error" notice unchanged; the duplicate empty-response notice is suppressed only when the stream actually errored; load-time sanitization warns with a count. |
| Interruption (Ctrl+C / Esc) and turn control | Cancel path keeps its two notices and its discard behavior; only the invalid push is guarded. |
| Partial state (session, undo stack, file cache) | `tool_pending` checkpoints keep the valid `content:null`+`tool_calls` assistant, so recovery is untouched; invalid assistants can no longer enter the checkpointed array in the first place. |
| Rollback / undo | Single commit revert. No file migration was ever performed, so no repair is needed; already-poisoned files simply stop being sanitized. |

## 11. Technical Risks and Trade-offs

| Risk | Likelihood | Mitigation |
|-------|---------------|-----------|
| Silent no-op: a turn that produced only reasoning now leaves no assistant record. | Certain, intended | Reasoning is stripped at persist anyway (F2), so the record could never be sent back safely. The user still sees the thinking output in the current session. |
| Load filter could drop a message a future provider shape would consider valid (e.g. object/array `content` with `null`). | Low | Predicate treats any non-null/undefined/non-empty content as valid; matrix test pins multimodal content. |
| The `pendingToolCalls` array keeps a stale invalid assistant if one was checkpointed before this fix. | Low | Out of scope: `resumePendingTools` validates each call (`isValidPendingToolCall`) and reports invalid checkpoints without executing; recorded as a residual note in the handoff. |
| The 400 could in theory name a *different* invalid shape (orphan tool result). | Medium | Explicitly P1-11's territory; our AC-07 test asserts the specific message text so it does not drift into a generic success. |
