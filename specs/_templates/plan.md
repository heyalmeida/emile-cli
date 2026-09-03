# Plan: [Spec title]

> Fill this in **after** the corresponding `spec.md` has `approved` status. This document answers HOW the spec will be implemented.

| Field | Value |
|-------|-------|
| **Spec** | `YYYY-MM-DD-spec-name` |
| **Status** | `draft` |

---

## 1. Technical Approach

*Solution overview: which `src/` modules are affected (cli.js / agent.js / api.js / ui.js / tools.js / mcp.js / skills.js / plans.js / prompt.js / config.js / history.js), patterns to use and why.*

## 2. Architectural Compliance

- **Relevant ADR(s):** list and confirm compliance (or point out the need for a new ADR)
- **Architecture document:** does the solution respect [docs/architecture.md](../../docs/architecture.md)? If not, what changes and why?
- **Design system:** do visual changes comply with [docs/visual-identity.md](../../docs/visual-identity.md)?

## 3. Security and Threat Model

| Element | Handling |
|----------|------------|
| Command execution and whitelist | |
| File writes and `resolveSafePath` | |
| LLM inputs (prompt injection / tool args) | |
| Secrets (API keys, sessions, exports) | |
| Controls and negative tests | |

*For non-applicable items, record "Not applicable" with justification. High risk requires explicit analysis.*

## 4. Impacted Modules

| Module | Path | Change |
|--------|---------|---------|
| | `src/...` | |

## 5. Impacted Flags / Slash Commands / Tools

| Type | Name | Change |
|------|------|--------|
| CLI flag | `--example` | |
| Slash command | `/example` | |
| Tool | `toolName` | |
| MCP | | |

## 6. Files to Create/Modify

| Action | Path (expected) | Notes |
|------|--------------------|-------------|
| Create | | |
| Modify | | |

## 7. Technical Decisions (summary)

*Decisions made during planning that deserve a record. Relevant architectural decisions should become ADRs in `docs/adr/`.*

## 8. Verification Strategy and Gates

*Map each AC to positive, negative, boundary and regression checks. Record the applicable commands: `node --check src/<file>.js` for each touched file, smoke test (`node bin/emile.js --verbose`), documented manual scripts and `npm audit` when there is a new dependency.*

## 9. Git Workflow

| Item | Answer |
|------|--------|
| **Working branch** | `development` — do not switch, create a feature branch or use a worktree unless the user explicitly asks (Rule 8 of `.clinerules`) |
| **Commit plan** | Commit coherent code/tests/docs units directly on `development`; stage only explicit paths (never `git add .` or `git add -A`) |

## 10. Failures, Partial State and Rollback

| Topic | Strategy |
|------|------------|
| Error handling and user-facing messages | |
| Interruption (Ctrl+C / Esc) and readline state | |
| Partial state (session, undo stack, file cache) | |
| Rollback / undo | |

## 11. Technical Risks and Trade-offs

| Risk | Likelihood | Mitigation |
|-------|---------------|-----------|
| | | |
