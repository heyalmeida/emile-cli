# Plan: Incremental model search picker

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-30-model-search-picker` |
| **Status** | `approved` |

## 1. Technical Approach

Keep provider/catalog data in `src/commands.js` and introduce a single-responsibility `src/ui/model-picker.js` for the interactive picker. Export a pure `filterModelOptions()` helper from that module so substring matching and the seven-item bound are deterministic and testable. The picker will use Node's keypress events/raw mode, redraw only its own bounded block, and provide a non-TTY fallback through the existing `select()` prompt with the same seven-item cap.

`runModelWizard()` will initialize OpenRouter as today, build normalized options, and call the picker. The custom model option remains available after filtered results. No new provider endpoint is assumed.

## 2. Architectural Compliance

- **Relevant ADR(s):** ADR-0001; no stack or dependency change.
- **Architecture document:** model discovery remains in `models.js`/`commands.js`; terminal interaction is isolated in `src/ui/model-picker.js` and exported through `src/ui/index.js`.
- **Design system:** use the canonical `C` palette and bounded redraw patterns already used by `prompt-input.js` and `switch-session.js`.

## 3. Security and Threat Model

| Element | Handling |
|----------|------------|
| Command execution and whitelist | Not applicable; picker never executes model ids. |
| File writes and `resolveSafePath` | Not applicable; config persistence remains in the existing config module. |
| LLM inputs (prompt injection / tool args) | Not applicable; catalog metadata is treated as untrusted display data. |
| Secrets (API keys, sessions, exports) | Never include credentials in labels or errors; only model id/metadata is rendered. |
| Controls and negative tests | Strip CR/LF/TAB and terminal controls from labels; test seven-row bound, case-insensitive matching, no matches, malformed ids, and non-TTY fallback. |

## 4. Impacted Modules

| Module | Path | Change |
|--------|---------|---------|
| Model wizard | `src/commands.js` | Replace unbounded select with searchable picker and preserve custom option. |
| Model picker UI | `src/ui/model-picker.js` | Add bounded incremental filter, redraw, keyboard navigation, cleanup and fallback. |
| UI barrel | `src/ui/index.js` | Export picker API. |
| Tests | `test/models.test.js`, `test/model-picker.test.js` | Cover formatting and search behavior. |

## 5. Impacted Flags / Slash Commands / Tools

| Type | Name | Change |
|------|------|--------|
| Slash command | `/model` | Searchable picker with up to seven visible results. |

## 6. Files to Create/Modify

| Action | Path (expected) | Notes |
|------|--------------------|-------------|
| Create | `src/ui/model-picker.js` | UI and pure filter helper. |
| Create | `test/model-picker.test.js` | Deterministic filter tests. |
| Modify | `src/commands.js` | Integrate picker. |
| Modify | `src/ui/index.js` | Export picker. |
| Modify | `specs/2026-08-30-model-search-picker/tasks.md` | Verification evidence and completion state. |

## 7. Technical Decisions (summary)

1. Use substring matching over model id and display label, case-insensitive, preserving provider/catalog order.
2. Render seven entries maximum; keyboard navigation wraps through the current filtered set.
3. Keep provider-specific remote discovery limited to the existing OpenRouter API until another provider contract is documented.

## 8. Verification Strategy and Gates

- Unit-test filtering, cap, matching fields, no-match behavior, and control-character-safe labels.
- Run `node --check` for every touched source file, `npm test`, `npm run lint`, and `git diff --check`.
- Manual TTY script: run `/model` with OpenRouter, verify empty query and a partial query; test Up/Down/Enter, Esc and Ctrl+C; repeat below 80 columns; confirm non-OpenRouter lists are capped/searchable.
- Run the required CLI smoke command where credentials are available; otherwise record the credential limitation without claiming a pass.

## 9. Git Workflow

| Item | Answer |
|--------|--------|
| **Feature branch** | `feat/model-system` |
| **Documentation branch** | `docs/documentation` for this spec and all docs/registry/changelog changes. |
| **Commit plan** | Commit this spec set on `docs/documentation`; commit source/tests on `feat/model-system`; commit docs closeout on `docs/documentation`. |

## 10. Failures, Partial State and Rollback

| Topic | Strategy |
|------------|------------|
| Error handling and user-facing messages | Treat catalog failure as existing curated fallback; show a clear no-match state and require a valid selection. |
| Interruption (Ctrl+C / Esc / readline state) | Remove keypress listener, restore prior raw mode, pause stdin and resolve cancellation. |
| Partial state (session, undo stack, file cache) | No session/undo mutation; save config only after Enter returns a selected model. |
| Rollback / undo | Revert the feature commit; no migration or destructive data operation. |

## 11. Technical Risks and Trade-offs

| Risk | Likelihood | Mitigation |
|-------|---------------|-----------|
| Terminal-specific keypress behavior differs. | Medium | Reuse existing raw-mode conventions and retain non-TTY select fallback. |
| Seven visible entries can hide a matching item. | Low | Arrow navigation cycles through the complete filtered result set while only seven rows are rendered. |
