# Plan: Workspace file mentions and skill discovery

| Field | Value |
|-------|-------|
| **Spec** | `2026-09-02-file-mentions-and-skills` |
| **Status** | `approved` |

## 1. Technical Approach

Create a focused read-only `src/mentions.js` module that extracts `@relative/path` candidates, discovers completion candidates, resolves the candidate via the same workspace-confinement model as tools/rules, rejects non-regular/binary files, and compiles bounded labeled attachment blocks. The agent appends the compiled block to the submitted user message before the API call, so attachments are per-turn rather than part of the cache-stable system prefix.

Extend the shared persistent prompt input with contextual `@` completion while retaining existing slash-command completion. Add `listSkills()` metadata support to `src/skills.js`, a `/skills` handler and a small UI renderer that reuses `C`, control stripping and width bounds.

## 2. Architectural Compliance

- **Relevant ADR:** ADR-0001; pure ESM, no build step or dependency.
- **Architecture:** mention parsing/loading stays isolated from the agent loop and UI. `agent/agent.js` orchestrates message composition only; `ui/` owns all rendering.
- **Design system:** `/skills` and completion use the existing palette, shared prompt layout and terminal sanitization.

## 3. Security and Threat Model

| Element | Handling |
|---------|----------|
| Command execution and whitelist | Not applicable: no command is issued. |
| File writes and `resolveSafePath` | No writes. Mention resolution uses normalized path plus realpath workspace confinement; no handler gate is bypassed. |
| LLM inputs | Explicit, labeled, bounded text-file content becomes user-turn context. Invalid paths and binary/special files are rejected. |
| Secrets (API keys, sessions, exports) | No automatic collection or logging. Document provider disclosure; preserve the project's existing session semantics without a separate attachment store. |
| Controls and negative tests | Traversal, absolute, external symlink, special/binary files, duplicate paths, oversized content and terminal-control filenames are covered. |

## 4. Impacted Modules

| Module | Path | Change |
|--------|---------|---------|
| Mentions | `src/mentions.js` | Parse, discover, securely load and compile bounded attachments. |
| Agent | `src/agent/agent.js` | Add attachment block to the outgoing current user message and show safe non-blocking warnings. |
| Skills | `src/skills.js` | Expose sorted metadata for `/skills`, including YAML keywords. |
| Commands | `src/commands/` | Register and dispatch `/skills`. |
| UI | `src/ui/skills-panel.js`, prompt-input modules | Render skill metadata and `@` completion safely. |
| Tests | `test/mentions.test.js`, `test/skills-command.test.js` | Focused behavior, security and rendering-independent checks. |

## 5. Impacted Flags / Slash Commands / Tools

| Type | Name | Change |
|------|------|--------|
| Prompt syntax | `@relative/path` | Explicit per-turn workspace file attachment. |
| Slash command | `/skills` | Read-only list of available workspace skills. |

## 6. Files to Create/Modify

| Action | Path (expected) | Notes |
|------|--------------------|-------|
| Create | `src/mentions.js` | Pure, secure attachment domain. |
| Create | `src/ui/skills-panel.js` | Safe terminal renderer. |
| Modify | `src/agent/agent.js`, `src/skills.js`, `src/commands/index.js`, command handler/UI barrel/prompt inputs | Integration. |
| Create | Focused test files | AC and regression coverage. |
| Modify | `README.md`, `docs/`, `features/`, `CHANGELOG.md`, spec files | Documentation/registry closeout on `docs/documentation`. |

## 7. Technical Decisions (summary)

- Attachments belong to the current user message, never the frozen system-prompt prefix; this preserves prompt-cache stability across turns.
- The supported first release accepts explicit relative-file tokens only. A path must both parse and securely resolve before it is considered a mention, preventing email/ordinary text false positives.
- Use fixed, documented per-file and total limits in the module; a later product decision may make them configurable.

## 8. Verification Strategy and Gates

- Focused temporary-workspace tests for all ACs, including external symlink, traversal, binary/special file and cap boundaries.
- Command registry/help/autocomplete tests and a `/skills` renderer test with control characters.
- `node --check` for every changed JS file, `npm run lint`, `npm test`, `git diff --check`.
- CLI smoke: `node bin/emile.js --verbose` with a simple mention request when credentials/MCP startup permit; otherwise record the concrete blocker and run a dependency-injected agent smoke.
- Manual UI check at 60/80/120 columns plus Esc/Ctrl+C while `@` completion is visible.

## 9. Git Workflow

| Item | Answer |
|------|--------|
| **Feature branch** | `feat/skills-system`; merge current `development` into the existing domain branch before code work, without rewriting its shared history. |
| **Documentation branch** | `docs/documentation` for spec, README, docs, feature registry and changelog. |
| **Commit plan** | Commit spec/plan/tasks and final docs explicitly on `docs/documentation`; code/tests explicitly on `feat/skills-system`. |

## 10. Failures, Partial State and Rollback

| Topic | Strategy |
|------|----------|
| Error handling and user-facing messages | Invalid mentions warn compactly and leave the original user request usable. |
| Interruption (Ctrl+C / Esc) and readline state | The existing prompt completion owner cleans up; mention completion must leave no raw-mode/listener residue. |
| Partial state (session, undo stack, file cache) | No writes, undo entries or separate persistence. The constructed attachment context exists only for the submitted turn. |
| Rollback / undo | Remove mention composition and command/UI integration; no user files were changed. |

## 11. Technical Risks and Trade-offs

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Large repositories slow completion | Medium | Bounded, filtered discovery with candidate cap and dependency-directory exclusions. |
| Explicit content increases request cost | Medium | Caps, clear labels and documentation. |
| Skills metadata lacks keywords | Low | Render `frontmatter.keywords` when present and an empty marker when absent. |
