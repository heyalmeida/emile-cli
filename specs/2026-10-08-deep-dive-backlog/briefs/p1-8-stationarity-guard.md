# BRIEF P1-8 — Stationarity guard: stop a stuck tool loop in ~8 iterations, not 90

> Read first: `specs/2026-10-08-deep-dive-backlog/_shared-constraints.md` and `docs/deep-dive.md` § 22.3 (loop row), § 4.

## Goal

The only defense against a looping agent is the blind cap `MAX_LOOP_ITERATIONS = 90` (`src/agent/agent.js:313, 333`) — a model repeating the same failing tool call burns up to 90 API calls of growing context. grok-build caps the *same mistake* instead: a canonical signature of each tool-call step, a consecutive-identical counter, a nudge at 4 and a hard stop at 8 (`grok: xai-grok-shell/src/session/acp_session_impl/turn.rs:3946-4025`). Port the mechanism.

## Current behavior (facts, verified 2026-10-09)

- `runAgentInner` loop: `iterationCount` (`agent.js:314`), cap check `:333`, warning at cap-1 `:350`.
- Tool batch executes sequentially at `:676` (`for (const [toolIndex, toolCall] of toolCalls.entries())`).
- Tool-call arguments arrive as JSON strings from the provider; key order is NOT guaranteed stable across identical calls (the signature must canonicalize).

## Required design (do not re-derive; implement this)

1. Pure helpers (export for tests, new file `src/agent/loop-guard.js`):
   - `stepSignature(toolCalls)` → stable string: for each call, `{ name, args }` with `name` sorted by name and `args` re-serialized with **recursively key-sorted** JSON (parse → sort → stringify; unparseable args fall back to the raw string).
   - `createStationarityGuard({ nudgeAt = 4, stopAt = 8 })` → `{ observe(toolCalls): 'fresh' | 'nudge' | 'stop', reset() }` — counts CONSECUTIVE identical signatures; any different step resets to 1.
2. Wire into `agent.js`: after a tool batch completes (the `:676` loop's end), `guard.observe(toolCalls)`:
   - `'nudge'` → push a user message: `"You are repeating the exact same tool call with identical arguments and getting the same result. Stop repeating: change your approach (different command, different arguments, read a different file) or explain the blocker to the user."`
   - `'stop'` → write a dim notice (`⚠ Agent loop is repeating the same step — stopping this turn.`) and `break` the while loop the same way the cap does today.
3. The existing 90-cap stays as the outer bound (defense in depth); the guard is additive and per-turn (fresh guard per `runAgentInner` call).

## Tests to add (new file `test/loop-guard.test.js`)

- Unit: `stepSignature` is order-insensitive for keys (`{"a":1,"b":2}` ≡ `{"b":2,"a":1}`) and sensitive to values; different tool sets produce different signatures.
- Unit: guard returns `'fresh'`×3, `'nudge'` on the 4th consecutive identical, `'stop'` on the 8th; a different step in between resets.
- Integration: fake `createCompletion` that always returns the same `tool_calls` batch (pattern: existing agent tests with injected `createCompletion` — `agent.js:207`); run `runAgent` and assert it terminates in ≤8 iterations and the nudge user message appears in the messages array.

## Constraints

- Do not change `MAX_LOOP_ITERATIONS` semantics, the checkpoint logic (`:670-727`), or the cancel path.
- No new dependencies.

## Verification

`node --check src/agent/loop-guard.js src/agent/agent.js && node --test test/loop-guard.test.js && npm run lint && npm test`

## Docs sync (Rule 2)

- CHANGELOG `[Unreleased]` → Added: stationarity guard (repeated identical tool step nudges at 4, stops at 8).
- `docs/deep-dive.md` § 4 and § 22.3: mark applied; § 20 pattern row for the guard.
- `features/agent-loop.md`: Change History row.
