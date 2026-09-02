# Tasks — Surface an empty-stream notice

- [x] T1. Added the `· (empty response)` notice in `src/agent/agent.js` inside the existing `isFirstChunk` branch, with the cancel/streamCanceled/streamErrored guards. Imported `GAP` from the UI barrel.
- [x] T2. Added `test/empty-stream-line.test.js` covering the empty / content-only / reasoning-only / cancelled scenarios (4 tests).
- [x] T3. `node --check` passes on every touched file.
- [x] T4. Full `npm test` suite: 176/176 pass.
- [ ] T5. Update `CHANGELOG.md` with a `### Fixed` entry.
- [ ] T6. Commit.
