# Plan — Live response streaming with continuous turn feedback

| Field | Value |
|-------|-------|
| **Spec** | `2026-09-03-live-response-streaming` |
| **Status** | `implemented` |

## 1. Technical Approach

Add a small response-stream lifecycle to `src/ui/response.js` with `startResponseStream`, `appendResponseStream` and `endResponseStream`. The lifecycle reuses the existing open-box geometry, sanitization, wrapping and Markdown renderer. Each content delta updates the same bounded response block; the post-stream path only calls the legacy `printAssistantResponse` when no progressive stream was started.

In `src/agent/agent.js`, keep the waiting spinner until a meaningful signal is observed. Reasoning starts/updates the existing thinking stream; the first content delta ends the thinking stream if necessary, starts the response stream and appends the delta; tool-call deltas stop the spinner and preserve the existing tool path. A no-visible-output stream still receives the existing empty-response notice.

## 2. Architectural Compliance

- **Relevant ADR:** ADR-0001 — plain ES modules, no build step, raw ANSI UI, no new runtime dependency.
- **Architecture:** UI remains under `src/ui/`; the agent only consumes UI lifecycle functions; API/provider logic is unchanged.
- **Design system:** the response block reuses the existing Tokyo Night palette, open-box layout, `MAX_BOX_W`, `BOX_INDENT`, sanitizer and Markdown renderer. No scattered colors are added.

## 3. Security and Threat Model

| Element | Handling |
|----------|----------|
| Command execution and whitelist | Not applicable; no tool gate is changed. |
| File writes and `resolveSafePath` | Not applicable; no file handler is changed. |
| LLM inputs (prompt injection / tool args) | No new instruction or tool argument is rendered. Existing model-output sanitization is used for the response text. |
| Secrets (API keys, sessions, exports) | No new status contains model IDs, prompts, arguments or credentials; session persistence is unchanged. |
| Controls and negative tests | Verify no duplicate response, empty metadata stream, cancel/error, tool-only response, active prompt arbitration and width boundaries. |

## 4. Impacted Modules

| Module | Path | Change |
|--------|------|--------|
| Agent loop | `src/agent/agent.js` | Start/append/finalize progressive response and keep spinner until visible output. |
| UI response | `src/ui/response.js` | Add live response lifecycle using the existing final renderer primitives. |
| UI barrel | `src/ui/index.js` | Export the new response lifecycle. |
| Spinner | `src/ui/spinner.js` | Render `update()` immediately so status changes never wait for the next interval. |
| Tests | `test/live-response-stream.test.js` | Cover delayed content, no duplicate output, metadata-only, cancel/error and tool-only paths. |

## 5. Impacted Flags / Slash Commands / Tools

| Type | Name | Change |
|------|------|--------|
| CLI flag | None | No new flag. |
| Slash command | None | No new command. |
| Tool | Existing tools | No tool contract change. |
| MCP | None | No MCP change. |

## 6. Files to Create/Modify

| Action | Path (expected) | Notes |
|--------|-----------------|-------|
| Create | `src/ui/response.js` lifecycle additions | Progressive response state and rendering. |
| Create | `test/live-response-stream.test.js` | Focused regression coverage. |
| Create | `specs/2026-09-03-live-response-streaming/{spec,plan,tasks}.md` | SDD record. |
| Modify | `src/agent/agent.js` | Stream lifecycle coordination. |
| Modify | `src/ui/index.js` | Public UI exports. |
| Modify | `src/ui/spinner.js` | Immediate status update. |
| Modify | `docs/architecture.md` | Document new UI lifecycle. |
| Modify | `docs/visual-identity.md` | Document progressive response feedback. |
| Modify | `docs/product.md` | Add user story/requirement and mark current scope. |
| Modify | `README.md` | Document the improved feedback behavior if user-facing. |
| Modify | `features/terminal-ui.md` and `features/agent-loop.md` | Registry traceability. |
| Modify | `CHANGELOG.md` | Unreleased entry. |

## 7. Technical Decisions

- Re-render the current response block rather than adding a second preview, so there is no duplicate final response and the cursor remains deterministic.
- Keep the existing Markdown renderer and apply it to the accumulated safe text on each redraw; this preserves the final visual language while allowing progressive feedback.
- Treat only reasoning, visible content and tool calls as meaningful stream output. Usage-only chunks do not prematurely stop the spinner.
- Do not add a timer or new status surface: the existing 80ms spinner and active-turn prompt arbitration already provide the progress channel.

## 8. Verification Strategy and Gates

- `node --check src/agent/agent.js src/ui/response.js src/ui/index.js src/ui/spinner.js`.
- Run `node --test test/live-response-stream.test.js test/empty-stream-line.test.js test/agent-reasoning-stream.test.js`.
- Run `npm test` and `npm run lint`.
- Run `node bin/emile.js --verbose` with a bounded/manual smoke task; record provider/network limitations if no live request is available.
- Exercise terminal-width tests at 60, 80 and 120 columns and verify cancel/error and active-turn prompt ownership.

## 9. Git Workflow

| Item | Answer |
|------|--------|
| **Feature branch** | Keep the current active workflow branch; do not switch branches for routine work. |
| **Documentation branch** | Documentation sync remains part of the current scoped change; no branch operations are performed automatically. |
| **Commit plan** | No commit is created by the assistant unless explicitly requested; if requested, stage only the files listed in this plan. |

## 10. Failures, Partial State and Rollback

| Topic | Strategy |
|-------|----------|
| Error handling and user-facing messages | Existing stream error formatting remains authoritative; partial response is closed before the existing error/cancel path is returned. |
| Interruption (Ctrl+C / Esc) and readline state | The existing turn control remains the owner of abort; the response lifecycle is finalized in the normal turn cleanup path. |
| Partial state (session, undo stack, file cache) | No new persisted state; accumulated text remains the same history content as before. |
| Rollback / undo | No tool changes; existing `/undo` semantics are unaffected. |

## 11. Technical Risks and Trade-offs

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Growing response redraws become expensive for very long outputs. | Medium | Reuse bounded rows, keep the output under the existing response width and verify a long stream in tests/manual smoke. |
| Markdown temporarily changes appearance while syntax is incomplete. | Medium | The block remains a valid preview and is fully rendered by the final redraw; no duplicate output is produced. |
| Existing active prompt arbitration conflicts with cursor-up rendering. | Low | The renderer emits one assembled frame per update through the same stdout path, matching the thinking-stream and active-turn contracts. |
