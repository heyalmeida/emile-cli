# Tasks — Pinpoint the spinner/thinking flicker

- [x] T1. Added the opt-in stderr log helper to `src/ui/spinner.js` and wrapped the two `process.stdout.write` call sites (tick and stop).
- [x] T2. Added the same helper to `src/ui/thinking.js` and wrapped the four relevant call sites (start expanded, start collapsed a/b, append, end collapsed, end expanded).
- [x] T3. `node --check` passes on `src/ui/spinner.js` and `src/ui/thinking.js`.
- [x] T4. Full `npm test` suite: 172/172 pass.
- [x] T5. Manual smoke: `EMILE_DEBUG_THINKING=1` produces the expected stderr log without polluting stdout.
- [ ] T6. Update `CHANGELOG.md` with an `### Added` entry.
- [ ] T7. Commit.
