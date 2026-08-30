# Spec: Modular CLI command dispatch

| Field | Value |
|-------|-------|
| **ID** | `2026-08-30-cli-command-modules` |
| **Status** | `implemented` |
| **Phase/Context** | Architecture & code structure / backlog item 2.1 |
| **Related documents** | [PRD](../../docs/product.md), [Architecture](../../docs/architecture.md), [Code quality](../../docs/code-quality-and-security.md), [ADR-0001](../../docs/adr/0001-tech-stack-choice.md) |

## 1. Problem / Motivation

`src/cli.js` contains bootstrap, lifecycle management, prompt handling and every slash-command implementation. This makes command changes risky and conflicts with the documented one-module-one-responsibility rule. This implements `IMPROVEMENTS.md` §2.1 without changing command behavior.

## 2. Goal

Move slash-command handlers and their dispatch table into a dedicated command module while keeping the CLI bootstrap, REPL lifecycle, input handling and all existing command output behavior unchanged.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-----------|---------------------|
| RF-S01 | Every currently supported slash command remains available with the same command name and behavior. | Must |
| RF-S02 | Command lookup/dispatch is owned by a dedicated module; `cli.js` no longer contains the command-specific branches. | Must |
| RF-S03 | Command handlers receive explicit dependencies/context rather than importing mutable REPL-local state. | Must |
| RF-S04 | Unknown input remains a normal agent prompt; `exit`, cancellation and signal shutdown remain unchanged. | Must |
| RF-S05 | No command handler bypasses existing safe path, safe execution, dry-run, session or UI gates. | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|----------|
| **Risk classification** | Medium — broad control-flow refactor around session, filesystem and MCP operations. |
| **Assets/secrets** | Session history, workspace paths and API configuration remain behind existing handlers; no new secret storage. |
| **Command execution / file writes** | Not changed; `/undo`, `/export` and agent tools retain existing gates. |
| **Untrusted inputs** | Slash-command text is matched exactly after trimming; ordinary user text is passed to the agent unchanged. |
| **Negative criteria** | Unknown commands must not execute a handler; cancellation and shutdown must not leave MCP sessions open. |

## 5. Out of Scope

- Adding, removing or renaming a slash command.
- Changing command UX, persistence format, tool security or provider behavior.
- Splitting the agent loop or changing the prompt input component.

## 6. Acceptance Criteria

- **AC-01:** Given each existing slash command, when invoked in the REPL, then the same handler effect and output occur after the refactor.
- **AC-02:** Given a normal non-command prompt, when entered, then it reaches `runAgent` exactly as before.
- **AC-03:** Given an unknown slash-like input, when entered, then it is treated as an agent prompt and no command handler runs.
- **AC-04:** Given `/exit`/`exit`, cancellation or SIGINT, when shutdown occurs, then the REPL exits and MCP shutdown is performed as before.
- **AC-05:** Given the command module, when inspected, then command matching and handler wiring are isolated from `cli.js` bootstrap code.

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|---------|--------------------|
| Handlers need local REPL state | Medium | Pass a small explicit context object with state accessors and lifecycle callbacks. |
| Refactor changes command ordering or prompt redraw | Medium | Preserve the existing branch order and run CLI smoke/manual command checks. |

## 8. References

- `IMPROVEMENTS.md` §2.1
- Related UI and session specs already delivered in this repository.
