# Tasks — Thinking stream survives the active-turn prompt arbitration

- [ ] T1. Reproduce the bug with `test/thinking-during-active-turn.test.js` and confirm the new test fails on the current code.
- [ ] T2. In `src/ui/turn-keys.js`, track `lastFrameHeight` next to `lastTopOffset`.
- [ ] T3. Rewrite `hideFrame` to erase exactly `lastFrameHeight` rows (per-line `\r\x1B[K` + `\n`), then return the cursor to the top border and restore the saved agent cursor.
- [ ] T4. Confirm the new regression test passes.
- [ ] T5. Run the full `npm test` suite.
- [ ] T6. `node --check` on every touched file.
- [ ] T7. Update `CHANGELOG.md` (`### Fixed`).
- [ ] T8. Add a refinement note to `docs/adr/0003-active-prompt-output-arbitration.md`.
- [ ] T9. Commit.
