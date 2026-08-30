# Plan: Modular CLI command dispatch

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-30-cli-command-modules` |
| **Status** | `implemented` |

## 1. Technical Approach

Create `src/commands/` with a command registry and handlers. The registry receives a context object containing session state, configuration, UI functions, filesystem/path utilities and lifecycle callbacks. Keep the REPL loop in `cli.js`: prompt input, exact command lookup, command execution, agent fallback and shutdown. Move only the command-specific branches into handlers, preserving their existing imports and output.

## 2. Architectural Compliance

- **Relevant ADR(s):** ADR-0001; no dependency or runtime stack change.
- **Architecture:** reduces `cli.js` to bootstrap/REPL orchestration and gives commands a single documented responsibility.
- **Design system:** handlers continue using existing `C` palette and UI components; no visual redesign.

## 3. Security and Threat Model

| Element | Handling |
|----------|------------|
| Command execution and whitelist | No change to tool command execution; `/undo` and agent tools retain existing gates. |
| File writes and `resolveSafePath` | `/export` and `/undo` retain their current paths and controls; no new path resolution. |
| LLM inputs (prompt injection / tool args) | Exact command matching prevents model/user text from being treated as a command unless it is an explicit supported command. |
| Secrets (API keys, sessions, exports) | Context passes references only; no logging or new serialization. |
| Controls and negative tests | Test unknown commands, cancellation paths, command lookup and syntax checks. |

## 4. Impacted Modules

| Module | Path | Change |
|--------|---------|---------|
| CLI bootstrap | `src/cli.js` | Delegate exact slash-command dispatch to the registry. |
| Command domain | `src/commands/index.js`, handlers | Own slash-command lookup and behavior. |
| Tests | `test/commands.test.js` | Verify registry matching and handler routing. |
| Documentation | `docs/architecture.md`, `CHANGELOG.md`, `IMPROVEMENTS.md` | Register the new module boundary and delivered item. |

## 5. Impacted Flags / Slash Commands / Tools

| Type | Name | Change |
|------|------|--------|
| Slash commands | Existing `/connect`, `/model`, `/switch`, `/sessions`, `/new`, `/clear`, `/rewind`, `/thinking`, `/help`, `/undo`, `/cost`, `/export`, `/rules` | Same names and behavior; dispatch moved. |

## 6. Files to Create/Modify

| Action | Path (expected) | Notes |
|------|--------------------|-------------|
| Create | `src/commands/index.js` | Registry and command dispatch contract. |
| Create | `src/commands/handlers.js` | Command handlers using explicit context. |
| Create | `test/commands.test.js` | Pure dispatch and unknown-command coverage. |
| Modify | `src/cli.js` | Remove command branches and wire the registry. |
| Modify | `docs/architecture.md`, `CHANGELOG.md`, `IMPROVEMENTS.md` | Documentation sync. |

## 7. Technical Decisions

1. Use a context object instead of a global command singleton so handlers can be tested without starting the TTY.
2. Keep input classification in `cli.js`; only exact supported names reach the registry, while other text remains an agent prompt.
3. Use one handler module initially to avoid premature file proliferation; split individual handlers only when a later feature needs independent lifecycle or tests.

## 8. Verification Strategy and Gates

- AC-01/02/03/05: unit-test command registry and unknown-input behavior; inspect that command branches are removed from `cli.js`.
- AC-04: run a documented interactive/manual shutdown check and existing smoke path.
- Run `node --check` on all touched JS files, `npm test`, `git diff --check`, and `node bin/emile.js --verbose` where MCP startup permits.
- No new dependency; `npm audit` is not applicable.

## 9. Git Workflow

| Item | Answer |
|------|--------|
| **Feature branch** | `refactor/cli-command-modules` |
| **Commit plan** | Implementation/tests first; docs and backlog status in a separate explicit commit. Never stage unrelated `tmp-fix-thinking.mjs`. |

## 10. Failures, Partial State and Rollback

| Topic | Strategy |
|------------|------------|
| Error handling and user-facing messages | Preserve current messages and catch boundaries in the same lifecycle layer. |
| Interruption (Ctrl+C / Esc) and readline state | Do not move prompt ownership; handlers return control to the same REPL loop. |
| Partial state | Context mutates the same `messages`, `sessionId`, `prefill` and config references used today. |
| Rollback / undo | Revert the feature commits; no user data migration is introduced. |

## 11. Technical Risks and Trade-offs

| Risk | Likelihood | Mitigation |
|-------|---------------|-----------|
| Handler context becomes too broad | Medium | Keep command registry contract documented and split state services in later specs. |
| Dynamic imports lose startup benefit | Low | Keep heavy module imports in `cli.js` and pass already-loaded dependencies into handlers. |
