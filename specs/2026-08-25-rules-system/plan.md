# Plan: User-authored project rules system (`.emilerules`)

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-25-rules-system` |
| **Status** | `implemented` |

---

## 1. Technical Approach

Add a focused `src/rules.js` read-only discovery module. It looks only at supported files in the workspace root, gives `.emilerules` precedence, caps injected content at 12,000 characters, and caches reads by path and mtime. `prompt.js` injects the selected content into the frozen system-prompt prefix. `/rules` only inspects the active source and teaches the user how to create an optional `.emilerules`; it never writes one.

## 2. Architectural Compliance

- **Relevant ADR:** ADR-0001; implementation remains plain JavaScript ES modules with no new dependency or build step.
- **Architecture:** rules discovery is isolated in `src/rules.js`; prompt assembly remains in `src/prompt.js`; slash dispatch remains in `src/cli.js`.
- **Design system:** `/rules` uses the existing `C` palette and plain CLI spacing; no new terminal interaction pattern.

## 3. Security and Threat Model

| Element | Handling |
|----------|----------|
| Command execution and whitelist | Not applicable; rules discovery executes no commands. |
| File writes and `resolveSafePath` | No writes. Candidate paths are fixed filenames joined to `config.workspaceDir`; realpath confinement rejects symlinks that escape the workspace. |
| LLM inputs | Local rules content is user-controlled and injected verbatim with a 12k cap; it is configuration, never interpreted by a tool handler. |
| Secrets | `/rules` intentionally displays the selected file; documentation warns that rules are prompt content and should not contain secrets. |
| Controls and negative tests | No file means no injection; unreadable files fail without a crash; oversized content is truncated; external symlinks are rejected; ANSI/OSC is stripped from `/rules`; CLI never creates `.emilerules`. |

## 4. Impacted Modules

| Module | Path | Change |
|--------|------|--------|
| Rules | `src/rules.js` | Discover, load, cache and format user-authored rules. |
| Prompt | `src/prompt.js` | Inject active rules into the stable prefix. |
| Commands | `src/commands.js` | Render read-only `/rules` inspection/help. |
| CLI | `src/cli.js` | Dispatch `/rules` and report active rules in verbose startup. |
| UI | `src/ui/rules-panel.js`, `src/ui/control.js` | Render inspected content safely and strip terminal controls. |

## 5. Impacted Flags / Slash Commands / Tools

| Type | Name | Change |
|------|------|--------|
| Slash command | `/rules` | Inspect the active user-authored rules source; no creation or mutation. |

## 6. Files to Create/Modify

| Action | Path | Notes |
|--------|------|-------|
| Create | `src/rules.js` | Read-only rules domain module. |
| Create | `src/ui/control.js`, `src/ui/rules-panel.js` | Terminal-safe rules rendering. |
| Modify | `src/prompt.js` | Stable-prefix injection. |
| Modify | `src/commands.js`, `src/cli.js` | Command output and dispatch. |
| Create | `features/project-rules.md` | Feature registry. |
| Modify | `README.md`, `docs/product.md`, `docs/architecture.md`, `docs/glossary.md`, `docs/visual-identity.md`, `CHANGELOG.md`, `features/README.md` | Documentation sync. |

The repository root `.emilerules` is deliberately not created or tracked; its content belongs to each user/project.

## 7. Technical Decisions

Rules are read-only, optional, and user-owned. Compatibility fallbacks remain because they are also project-maintainer-authored guidance. A model-facing rules-management tool is out of scope: it would let the model mutate the authority layer and would conflict with user ownership.

## 8. Verification Strategy and Gates

- `node --check` on every touched JavaScript file.
- Focused temporary-workspace script: precedence, no-file behavior, 12k boundary/truncation, cache refresh, formatted block, external-symlink rejection and ANSI/OSC stripping.
- Prompt integration script for presence and absence.
- CLI `--help` and source smoke test; interactive API smoke is recorded separately if credentials/network are unavailable.
- Verify no tracked root `.emilerules` exists.

## 9. Git Workflow

| Item | Answer |
|------|--------|
| **Feature branch** | `feat/rules-system` (already active) |
| **Commit plan** | Regression import repair as a focused commit; rules implementation/spec; documentation/registry closeout. Explicit paths only. |

## 10. Failures, Partial State and Rollback

| Topic | Strategy |
|------|----------|
| Error handling | Read failures produce an inactive result with an error; startup continues. |
| Interruption | `/rules` is synchronous/read-only and does not alter readline state. |
| Partial state | Cache is replaced only after a successful read. |
| Rollback | Remove prompt/command integration and `src/rules.js`; no user file was written. |

## 11. Technical Risks and Trade-offs

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| A fallback file contains instructions intended for another agent | Medium | `.emilerules` has precedence; `/rules` makes the selected source visible. |
| Rules contain secrets | Low | Document that content is sent to the model; do not log it automatically at startup. |
| Large rules destabilize cache/cost | Medium | 12k cap and frozen per-session prefix. |
