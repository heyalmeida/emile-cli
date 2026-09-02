# Tasks — Plan progress in the prompt footer

- [x] T1. Added `getPlanProgress()` to `src/plans.js`; removed `renderPlanStatus()` and its unused `C` import.
- [x] T2. Removed `renderPlanStatus` import and call from `src/agent/agent.js`; replaced with an explanatory comment that points readers to the footer helper.
- [x] T3. Extended `buildFooterInfo` in `src/ui/prompt-input-persistent.js` to call `getPlanProgress()` and append a `tasks: X/Y` segment (`C.warn` while incomplete, `C.success` when complete) when `config.plansMode` is true.
- [x] T4. Updated `features/plans-mode.md` (description, technical row, change history).
- [x] T5. Updated `docs/visual-identity.md` status bar / footer row.
- [x] T6. Added `CHANGELOG.md` entry under `### Fixed`.
- [x] T7. `node --check` passes on `src/plans.js`, `src/agent/agent.js`, `src/ui/prompt-input-persistent.js`.
- [x] T8. Manual verification: `getPlanProgress()` returns `{completed:2,total:5}` for a `task.md` with mixed boxes, `null` when there are no boxes, and `null` when `task.md` is missing.
- [x] T9. `git grep` for `Plan Progress` shows only documentation references (CHANGELOG and `features/plans-mode.md`).
- [x] T10. `npm test`: 171/171 pass.
