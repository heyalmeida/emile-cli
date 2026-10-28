# Spec: maxLoopIterations single source of truth (P2-8 warm-up)

Date: 2026-10-08 · Branch: `development` · Source: deep-dive backlog § 21 P2-8

## Problem

The agent-loop cap has two sites of truth:

- `src/config.js:113-116` — `readPositiveInt(savedConfig.maxLoopIterations ?? EMILE_MAX_LOOP_ITERATIONS, 90)` → default **90**.
- `src/agent/agent.js:313` — `config.maxLoopIterations || 40` → dead fallback of **40**.

`readPositiveInt` guarantees a positive integer, so `|| 40` is unreachable in
production — but reachable via direct `config` mutation (tests, future callers).
A silent second default that can diverge from the real one.

## Requirements

- R1. `src/config.js` exports `DEFAULT_MAX_LOOP_ITERATIONS = 90`.
- R2. `src/config.js` exports `readPositiveInt`.
- R3. `config.js` uses `DEFAULT_MAX_LOOP_ITERATIONS` as the `readPositiveInt` fallback for `maxLoopIterations`.
- R4. `src/agent/agent.js` computes the cap as `readPositiveInt(config.maxLoopIterations, DEFAULT_MAX_LOOP_ITERATIONS)`; the `|| 40` literal is gone; no second literal guard is introduced.
- R5. Every doc/docs mention of a specific numeric default aligns to "configurable, default `DEFAULT_MAX_LOOP_ITERATIONS` (90)".
- R6. New test file `test/max-loop-iterations.test.js` with exactly three assertion groups (default 90; exported constants; loop-cap behavior with `config.maxLoopIterations = 2`).
- R7. `CHANGELOG.md` `[Unreleased]` gains a Fixed entry.

## Non-goals / out of scope

- `cli.js` flag wording/help text; unrelated docs drift.
- Any other bug noticed along the way (report only).
- No new dependencies, no build steps, no TypeScript.
- No behavior change: with no config/env/flag the effective cap is 90 before and after.

## Forbidden

- Weakening security gates (safe mode, dry-run, whitelist, `resolveSafePath`).
- A second magic number for the cap anywhere in the repo.

## Acceptance criteria

- [ ] `DEFAULT_MAX_LOOP_ITERATIONS = 90` exported from `src/config.js`, used by BOTH `config.js` and `agent/agent.js`.
- [ ] No `|| 40` in `src/agent/agent.js`.
- [ ] `test/max-loop-iterations.test.js` exists, has the 3 groups, passes.
- [ ] Effective cap unchanged (90) when nothing is configured.
- [ ] Gates green: `node --check`, `node --test test/max-loop-iterations.test.js`, `npm run lint`, `npm test`.
- [ ] `CHANGELOG.md` updated; deep-dive P2-8 marked applied if present.
