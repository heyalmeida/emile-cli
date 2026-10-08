# Tasks

- [x] 1. Spec folder (`spec.md`, `plan.md`, `tasks.md`)
- [x] 2. `config.js`: export `DEFAULT_MAX_LOOP_ITERATIONS = 90`, export `readPositiveInt`, use the constant as fallback
- [x] 3. `agent.js:313`: replace `|| 40` with `readPositiveInt(config.maxLoopIterations, DEFAULT_MAX_LOOP_ITERATIONS)`
- [x] 4. Sweep for stray loop-cap literals / doc claims
- [x] 5. `test/max-loop-iterations.test.js` (3 groups)
- [x] 6. Gates: `node --check`, targeted `node --test`, `npm run lint`, `npm test`
- [x] 7. CHANGELOG `[Unreleased]` Fixed entry; deep-dive P2-8 tick
- [x] 8. Commits on `development` (explicit paths)
