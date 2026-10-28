# BRIEF P1-11 — Compression must never leave a broken tool-pair in history

> Read first: `specs/2026-10-08-deep-dive-backlog/_shared-constraints.md` and `docs/deep-dive.md` § 22.3 (compaction row), § 11.

## Goal

`compressContextIfNeeded` rewrites the live `messages` array with a two-while-loop split heuristic (`src/agent/compression.js:97-104`) and NO structural validation afterwards. If any orphan survives — a `role:'tool'` message whose `tool_call_id` was not declared by the preceding assistant, or an assistant with `tool_calls` whose results got summarized away — the next provider request 400s, the loop breaks (`agent.js:429`), and `finalizeSessionTurn` PERSISTS the poisoned array (`cli.js:241-250`): the session fails at the start of every subsequent turn. grok-build runs sanitize → validate → repair after every history rewrite and falls back to a minimal history if violations remain (`grok: xai-chat-state/src/compaction_utils.rs:1002-1100`; `xai-grok-shell/src/session/compaction.rs:1874-1911`). Add the same invariant.

## Current behavior (facts, verified 2026-10-09)

- Split: `splitIdx = max(1, len-6)`, walk back over `tool`, then over one `assistant` with `tool_calls` (`compression.js:97-104`).
- The `messages.length <= 8` early-return (`:66`) skips compression for short-but-huge histories (5 giant tool results) — the overflow can arrive with compression disabled.
- Forced compression on overflow (`agent.js:403-408`) passes NO `contextLimit`/`contextTokens` → falls back to `getModelInfo(model).context` (`compression.js:69-72`), wrong when the active model already fell back to `openrouter/free`.
- Summary acceptance: any non-empty string (`:110-117`) — a one-line "Ok!" silently deletes the history.

## Required design (do not re-derive; implement this)

1. New exported `repairToolPairing(messages)` in `compression.js` (pure, mutates in place, returns `{ droppedOrphans, filledResults }`):
   - Walk forward; for each `assistant` with `tool_calls`, collect the ids; the following consecutive `tool` messages must cover exactly those ids.
   - `tool` message whose id is NOT declared by the immediately-preceding assistant run → DROP (grok's strict adjacency rule).
   - Declared id with no result → INSERT synthetic `{ role:'tool', tool_call_id, content:'[result lost during context compression — the tool may or may not have run; verify current state before retrying]' }` at the right position.
   - Re-run the walk once after insertion (validate pass); residual violations → return counts so the caller can fall back to `hardTruncateHistory` (which already exists, `:27`).
2. Call `repairToolPairing` at the END of every successful compression path (both the summary-injection branch `:111-119` and the `hardTruncateHistory` branch) AND at the resume path that rehydrates `tool_pending` sessions (`agent.js:152-192` — `resumePendingTools` already fills cancel placeholders; run repair after it).
3. `agent.js:403-408`: pass `contextLimit` (and the model actually used by the failed request) to the forced call — the turn already computed `contextUsage`; thread it.
4. Degenerate-summary guard: if `summaryText.trim().length < 300`, do NOT inject; fall through to `hardTruncateHistory` (`:125` path) instead.
5. The `messages.length <= 8` gate: change to skip only when BOTH `messages.length <= 8` AND the char estimate is under the threshold (compute the existing estimate first; the gate's purpose was avoiding summarizing tiny histories, not skipping huge ones).

## Tests to add (extend `test/` — new file `test/compression-repair.test.js`)

- Orphan tool result (no declaring assistant) is dropped; counts reported.
- Assistant with 2 `tool_calls`, 1 result → synthetic result inserted for the missing id, order preserved.
- History that survives compression with a dangling assistant → after repair, every `tool` has a parent and every parent's ids are covered (assert the invariant, not the exact text).
- Degenerate summary ("Ok!") → `hardTruncateHistory` path taken, no summary message.
- Gate: 6 messages with 200k-char tool results DO compress (estimate-based).
- Integration shape: fake `createCompletion` for the summarizer; run `compressContextIfNeeded` end-to-end and assert the repaired array round-trips through a strict validator helper exported for tests.

## Constraints

- Do NOT change the hysteresis (`:83-89`) or the 80% trigger math beyond item 5.
- Do not touch the provider request builder; repair is local to `messages`.
- No new dependencies.

## Verification

`node --check src/agent/compression.js src/agent/agent.js && node --test test/compression-repair.test.js && npm run lint && npm test`

## Docs sync (Rule 2)

- CHANGELOG `[Unreleased]` → Fixed: context compression can no longer leave orphan tool messages that poison a session permanently.
- `docs/deep-dive.md` § 11 and § 22.3: mark applied; § 20 pattern row (add "tool-pair repair after history rewrite").
- `features/context-compression.md`: Change History row.
