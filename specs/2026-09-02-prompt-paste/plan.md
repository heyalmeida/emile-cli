# Plan: Preserve pasted multiline prompts

| Field | Value |
|-------|-------|
| **Spec** | `2026-09-02-prompt-paste` |
| **Status** | `approved` |

---

## 1. Technical Approach

Use the terminal's bracketed-paste protocol for both raw-mode prompt owners.
Enable it immediately after raw stdin ownership begins and disable it in the
same cleanup path that restores stdin. Node's `readline.emitKeypressEvents`
emits `paste-start` and `paste-end` markers but still represents embedded
newlines as `Enter`; each prompt therefore tracks that delimited state and
inserts those internal Enter events literally. Normalize CRLF to LF at the
text insertion boundary.

## 2. Architectural Compliance

- **Relevant ADR(s):** ADR-0001 (raw ANSI UI) and ADR-0003 (exclusive stdin ownership). No new architectural decision is needed.
- **Architecture document:** stays within the UI input modules; neither the REPL contract nor the agent loop changes.
- **Design system:** no visual tokens or layout rules change; the existing multiline layout is reused.

## 3. Security and Threat Model

| Element | Handling |
|---------|----------|
| Command execution and whitelist | Not applicable. |
| File writes and `resolveSafePath` | Not applicable. |
| LLM inputs (prompt injection / tool args) | Pasted content remains user draft text and uses the existing submission boundary. |
| Secrets (API keys, sessions, exports) | No logging or persistence is added. |
| Controls and negative tests | Assert enable/disable lifecycle and that paste does not call submit until a separate Enter. |

## 4. Impacted Modules

| Module | Path | Change |
|--------|---------|--------|
| Idle prompt | `src/ui/prompt-input-persistent.js` | Own and restore bracketed-paste mode; normalize a pasted text chunk. |
| Active prompt | `src/ui/turn-keys.js` | Keep matching protocol lifecycle and normalize pasted text before queueing. |
| UI tests | `test/prompt-input-render.test.js`, `test/turn-keys-visibility.test.js` | Cover multiline payload retention, explicit submission, and mode cleanup. |

## 5. Impacted Flags / Slash Commands / Tools

| Type | Name | Change |
|------|------|--------|
| CLI flag | — | None |
| Slash command | — | None |
| Tool | — | None |
| MCP | — | None |

## 6. Files to Create/Modify

| Action | Path | Notes |
|--------|------|-------|
| Modify | `src/ui/prompt-input-persistent.js` | Bracketed-paste ownership for idle input. |
| Modify | `src/ui/turn-keys.js` | Bracketed-paste ownership for active input. |
| Modify | `test/prompt-input-render.test.js` | Idle regression cases. |
| Modify | `test/turn-keys-visibility.test.js` | Active queue regression case. |

## 7. Technical Decisions (summary)

Prefer the terminal protocol over keypress timing. Timing cannot reliably
distinguish a fast human Enter from a pasted newline; bracketed paste supplies
the needed boundary without delaying normal submission.

## 8. Verification Strategy and Gates

- AC-01/02: simulated idle bracketed payload followed by a separate Enter.
- AC-03: simulated active payload followed by Enter.
- AC-04: capture raw output and assert balanced enable/disable sequences.
- AC-05: `node --check` on both modules, targeted tests, `npm test`, `npm run lint`, and a non-interactive smoke test.

## 9. Git Workflow

| Item | Answer |
|------|--------|
| **Feature branch** | `fix/persistent-prompt-input`; current worktree has user experiments, so no branch switch occurs until they are safely committed or stashed. |
| **Documentation branch** | `docs/documentation` for this spec, registry update and CHANGELOG. |
| **Commit plan** | Code/tests on the fix branch; documentation separately, with explicit paths only. |

## 10. Failures, Partial State and Rollback

| Topic | Strategy |
|------|----------|
| Error handling and user-facing messages | No new error path. |
| Interruption (Ctrl+C / Esc) and readline state | Preserve handlers; cleanup remains idempotent and restores terminal mode. |
| Partial state (session, undo stack, file cache) | Not applicable. |
| Rollback / undo | Revert only the focused code/test commit. |

## 11. Technical Risks and Trade-offs

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Terminal lacks bracketed-paste support. | Low | Protocol is best-effort and does not prevent ordinary input. |
| Cleanup is skipped after nested ownership. | Low | Test the lifecycle and keep cleanup ownership local. |
