# Feature: Built-in tools

| Field | Value |
|-------|-------|
| **Status** | `active` |
| **Delivery date** | 2026-08-25 |
| **Source spec** | `specs/2026-08-25-project-structure` |
| **PRD RFs served** | RF-04, RF-05 |
| **Owner/Area** | Tools / Security |

## Description

Emile gives the model a compact set of workspace and shell capabilities:
reading, writing, editing, listing, searching and running commands. These
capabilities make the CLI useful for real coding tasks while keeping user
approval and workspace boundaries at the tool boundary.

## How It Works

The model receives OpenAI-compatible schemas. The agent dispatches each call to
one handler, which validates paths and command policy before performing the
operation and returning a bounded result to the model.

## Technical Details

| Item | Detail |
|------|---------|
| **CLI flags** | `--dry-run`, `--no-safe` |
| **Slash commands** | `/undo [N]` for recorded file changes |
| **Tools** | `readFile`, `writeFile`, `editFile`, `listDir`, `findFiles`, `grepSearch`, `runCommand` |
| **Configuration** | Workspace root from the current working directory |
| **Applicable security gates** | `resolveSafePath`, safe mode, dry-run, command whitelist, output caps and undo tracking |

## Where It Lives in the Code

| Layer | Main paths |
|--------|---------------------|
| Schemas and barrel | `src/tools/definitions.js`, `src/tools/index.js` |
| Security | `src/tools/security.js` |
| Handlers | `src/tools/handlers/` |
| State and diffs | `src/tools/file-state.js`, `src/tools/show-diff.js` |

## Known Limitations

Shell execution remains subject to the host environment and safe-mode
confirmation; the CLI does not provide an isolated container.

## Change History

| Date | Change | Reference |
|------|--------|-----------|
| 2026-08-30 | Registered the shipped built-in tool surface | `specs/2026-08-30-feature-registry-completion` |
