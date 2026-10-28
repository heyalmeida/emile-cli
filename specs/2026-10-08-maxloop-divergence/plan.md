# Plan: maxLoopIterations divergence fix

## Approach

Config layer becomes the single owner of the default; the agent loop re-validates
through the same exported helper instead of a `||` literal.

1. `src/config.js`
   - Add `export const DEFAULT_MAX_LOOP_ITERATIONS = 90;` near the top (before `config`).
   - Change `function readPositiveInt` → `export function readPositiveInt`.
   - Use `DEFAULT_MAX_LOOP_ITERATIONS` as the fallback in the `maxLoopIterations` entry.
2. `src/agent/agent.js`
   - Import `readPositiveInt` and `DEFAULT_MAX_LOOP_ITERATIONS` from `../config.js` (extend the existing `config` import).
   - Replace `const MAX_LOOP_ITERATIONS = config.maxLoopIterations || 40;` with
     `const MAX_LOOP_ITERATIONS = readPositiveInt(config.maxLoopIterations, DEFAULT_MAX_LOOP_ITERATIONS);`
3. Sweep repo for stray loop-cap literals (40/90 near "loop"/"iteration") in code, docs, README; align wording.
4. Test: `test/max-loop-iterations.test.js`
   - Group 1: with a temp HOME (no `~/.emile/config.json`) and no `EMILE_MAX_LOOP_ITERATIONS`, dynamic-import `config.js` → `config.maxLoopIterations === 90`.
   - Group 2: `DEFAULT_MAX_LOOP_ITERATIONS === 90`, `readPositiveInt(undefined, DEFAULT_MAX_LOOP_ITERATIONS) === 90`.
   - Group 3: loop-cap path — stub `config.maxLoopIterations = 2`, call `runAgentInner` with a `createCompletion` fake that always returns a tool call, assert the turn breaks after 2 iterations (cap message / no further API calls).
5. Gates, CHANGELOG, deep-dive tick, commit (spec + code + test first, docs second if needed).

## Test-environment notes

- `config.js` resolves `~/.emile/config.json` via `os.homedir()` at import time;
  the test sets `HOME`/`USERPROFILE` to a fresh temp dir **before** the dynamic
  import to guarantee the "no saved config" case, and deletes
  `EMILE_MAX_LOOP_ITERATIONS` from the environment.
- `node --test` runs each file in its own process, so module-cache pollution
  from other test files is not a concern.

## Risks

- `runAgentInner`'s signature/options must be read from source before writing
  Group 3; fake `createCompletion` must match its call shape.
- Behavior risk is nil: `readPositiveInt(90, 90) === 90`; the only paths that
  change are ones that were previously falling back to the wrong (40) cap.
