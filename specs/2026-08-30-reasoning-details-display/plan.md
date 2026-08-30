# Plan: Reliable reasoning display across streaming formats

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-30-reasoning-details-display` |
| **Status** | `implemented` |

## 1. Technical Approach

Add a small pure helper in `src/agent/reasoning.js` to normalize structured reasoning details: return displayable text from `reasoning.text`/`reasoning.summary` fields, merge fragments by stable id/index, and retain every original structured block for history. Use it from `src/agent/agent.js` alongside the existing legacy delta branches.

Restore one `config.expandThinking` switch across `src/config.js`, `src/cli.js`, `src/ui/prompt-input.js` and `src/ui/thinking.js`, defaulting to expanded visibility. In expanded streaming mode, `startThinkingStream()` writes a single physical header row, the renderer counts that row explicitly, snapshots the mode at stream start, and `endThinkingStream()` rewrites only the known header row to `Thought for Ns`; collapsed mode keeps the existing ghost transition. Structured reasoning is stored as `assistantMessage.reasoning_details` when available. In `src/api/client.js`, use OpenRouter's unified `reasoning` object and keep the existing `reasoning_effort` gate for other providers.

## 2. Architectural Compliance

- **Relevant ADR(s):** ADR-0001; no new dependency or build step.
- **Architecture document:** compliant; the helper remains in the agent domain and rendering remains in `src/ui/`. Update the module table for the new reasoning helper.
- **Design system:** compliant with the existing muted/ghost thinking states, sanitizer and one-block rhythm; no new palette or layout.

## 3. Security and Threat Model

| Element | Handling |
|----------|------------|
| Command execution and whitelist | Not applicable; tool dispatch is unchanged. |
| File writes and `resolveSafePath` | Not applicable; no file paths are introduced. |
| LLM inputs (prompt injection / tool args) | Provider reasoning is treated as untrusted output; only typed text/summary fields reach the UI sanitizer. Unknown fields are ignored for display. |
| Secrets (API keys, sessions, exports) | No credentials are read or logged. Structured reasoning is kept in the same assistant history path; encrypted payloads are never printed. |
| Controls and negative tests | Run malformed/encrypted detail tests, ANSI sanitization checks, and the existing UI harness at 60/80 columns. |

## 4. Impacted Modules

| Module | Path | Change |
|--------|---------|---------|
| Agent domain | `src/agent/agent.js` | Consume structured reasoning deltas and attach preserved details to assistant history. |
| Agent utility | `src/agent/reasoning.js` | Normalize displayable structured reasoning and merge fragments. |
| Reasoning UI | `src/ui/thinking.js` | Use the unified visibility state and finalize expanded stream header with duration. |
| Configuration/REPL | `src/config.js`, `src/cli.js`, `src/ui/prompt-input.js` | Remove split visibility state; toggle `expandThinking` consistently. |
| API domain | `src/api/client.js` | Build provider-specific reasoning request parameters; OpenRouter receives `reasoning`. |

## 5. Impacted Flags / Slash Commands / Tools

| Type | Name | Change |
|------|------|--------|
| Slash command | `/thinking` | Same command; one state now controls live and completed reasoning. |
| Keyboard shortcut | `Ctrl+P` | Same shortcut; same unified state. |

## 6. Files to Create/Modify

| Action | Path (expected) | Notes |
|------|--------------------|-------------|
| Create | `src/agent/reasoning.js` | Pure structured-reasoning normalizer. |
| Create | `test/reasoning.test.js` | Positive, encrypted, malformed and fragment-merge coverage. |
| Create | `test/api-client.test.js` | OpenRouter reasoning request mapping regression coverage. |
| Modify | `src/agent/agent.js` | Parse and preserve structured details. |
| Modify | `src/api/client.js` | Send the OpenRouter unified reasoning request object. |
| Modify | `src/ui/thinking.js` | Unified toggle and duration header. |
| Modify | `src/config.js`, `src/cli.js`, `src/ui/prompt-input.js` | Remove split toggle state. |
| Modify | `docs/architecture.md`, `docs/visual-identity.md`, `features/terminal-ui.md`, `IMPROVEMENTS.md`, `CHANGELOG.md` | Documentation synchronization. |
| Create | `specs/2026-08-30-reasoning-details-display/*` | SDD artifacts and verification log. |

## 7. Technical Decisions (summary)

1. Structured reasoning blocks are preserved separately from their display text so providers can validate tool-call continuation.
2. Encrypted reasoning fields are retained for protocol continuity but never rendered; only `text` and `summary` are user-visible.
3. One visibility state avoids the misleading situation where `/thinking` reports expanded while the live stream remains collapsed; it defaults to expanded so the first turn exposes available reasoning.

## 8. Verification Strategy and Gates

| AC | Verification |
|----|--------------|
| AC-01/02/03/07 | `node --test test/reasoning.test.js` with legacy, structured, encrypted, malformed and fragmented fixtures. |
| AC-04/05/08 | Harness/manual stream simulation at 60 and 80 columns; inspect ANSI output for a single physical header, unified toggle and one final duration header. |
| AC-09 | `node --test test/api-client.test.js`; inspect that OpenRouter sends `reasoning` and not `reasoning_effort`. |
| AC-06 | Unit fixture with no reasoning fields plus `node bin/emile.js --verbose` smoke path where credentials are available; no reasoning is fabricated. |
| All | `node --check` on every touched JS file; `npm test`; no new dependency, so `npm audit` is not applicable. |

## 9. Git Workflow

| Item | Answer |
|------|--------|
| **Feature branch** | `fix/reasoning-details-display` (created from the current working branch because it contained the user's in-progress reasoning UI changes). |
| **Commit plan** | Commit implementation/tests first with explicit paths; commit documentation/spec updates separately. Do not stage `tmp-fix-thinking.mjs` unless explicitly requested. |

## 10. Failures, Partial State and Rollback

| Topic | Strategy |
|------------|------------|
| Error handling and user-facing messages | Ignore malformed structured display fields and continue the stream; existing stream error handling remains. |
| Interruption (Ctrl+C / Esc and readline state) | No change to input interruption; the thinking header rewrite is confined to the stream block. |
| Partial state (session, undo stack, file cache) | Only the assistant message gains optional `reasoning_details`; tools and session lifecycle remain unchanged. |
| Rollback / undo | Revert the implementation commit; no user files or tool state are modified. |

## 11. Technical Risks and Trade-offs

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Provider-specific structured block shape evolves | Medium | Type-check known text/summary fields, preserve unknown blocks, and keep legacy branches. |
| Header cursor rewrite leaves stale content | Medium | Use explicit erase + bounded cursor movement and verify with harness output. |
