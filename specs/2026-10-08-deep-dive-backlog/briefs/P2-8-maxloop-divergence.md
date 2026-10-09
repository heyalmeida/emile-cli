# BRIEF P2-8 — Resolve the maxLoopIterations divergence (single source of truth)

> Read first: `specs/2026-10-08-deep-dive-backlog/_shared-constraints.md` and `docs/deep-dive.md` § 21 (P2-8). This is the warm-up brief: trivial, no design ambiguity.

## The divergence (verified facts)

Two sites disagree on the agent-loop cap:

1. `src/config.js:110-116` — the config layer OWNS the value:

```js
maxLoopIterations: readPositiveInt(
  savedConfig.maxLoopIterations ?? process.env.EMILE_MAX_LOOP_ITERATIONS,
  90,   // ← default 90
),
```

2. `src/agent/agent.js:313` — the loop re-invents a different fallback:

```js
const MAX_LOOP_ITERATIONS = config.maxLoopIterations || 40;   // ← fallback 40
```

`readPositiveInt` (`config.js:53-56`) already guarantees `config.maxLoopIterations` is a positive integer ≥ 1, so the `|| 40` branch is dead in production but reachable from tests/direct mutation — and it silently means a DIFFERENT cap (40) than the documented one (90). The consumer-facing knob is wired at `src/cli.js:40` (`--max-loop-iterations <n>`) and applied at `cli.js:73-74`.

## Required change

1. Export one constant from `src/config.js`: `export const DEFAULT_MAX_LOOP_ITERATIONS = 90;` and use it as the `readPositiveInt` fallback at `config.js:113-116`.
2. In `src/agent/agent.js:313`, replace `config.maxLoopIterations || 40` with a direct read plus the same shared constant as the last-resort guard:

```js
const MAX_LOOP_ITERATIONS = readPositiveInt(config.maxLoopIterations, DEFAULT_MAX_LOOP_ITERATIONS);
```

(reuse config's `readPositiveInt` — export it too, or inline an equivalent two-line guard; do NOT duplicate a second magic number).
3. Grep the repo for any other hardcoded loop cap (`40`, `90` near "loop"/"iteration") and docs claims (`docs/`, `README.md`) mentioning a specific default; align every mention to 90 or, better, to "configurable, default `DEFAULT_MAX_LOOP_ITERATIONS`".
4. No behavior change: with no config/env/flag set, the effective cap must remain 90 today and 90 after this change (test proves it).

## Tests to add (`test/max-loop-iterations.test.js`)

- `config.maxLoopIterations` defaults to 90 with no saved config and no env var.
- `DEFAULT_MAX_LOOP_ITERATIONS === 90` and `readPositiveInt(undefined, DEFAULT_MAX_LOOP_ITERATIONS) === 90`.
- Loop-cap message path: with a stubbed `config.maxLoopIterations = 2`, the loop stops after 2 iterations (drive `runAgentInner` with a `createCompletion` fake that always returns a tool call; assert the turn breaks after the cap instead of looping).

## Verification

`node --check src/config.js src/agent/agent.js && node --test test/max-loop-iterations.test.js && npm run lint && npm test`

## Docs sync (Rule 2)

- CHANGELOG `[Unreleased]` → Fixed: `maxLoopIterations` fallback divergence (agent loop no longer carries a second default).
- If `docs/deep-dive.md` § 21 P2-8 exists, mark applied.
