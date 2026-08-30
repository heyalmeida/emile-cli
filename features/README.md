# Features — Catalog of Implemented Features

Every feature delivered in emile-cli gets its own file in this directory, named after the feature in **English kebab-case** (e.g., `features/plans-mode.md`). The goal is a fast, consultable catalog of what exists in the CLI, how and why.

> Creating the feature file is **mandatory** and is defined in **Rule 7 of [`.clinerules`](../.clinerules)**.

---

## Relationship with Specs (SDD)

| Artifact | Role | When it's born |
|----------|-------|--------------|
| `specs/YYYY-MM-DD-name/` | **Process**: requirements, plan and tasks of the implementation | Before implementing |
| `features/feature-name.md` | **Registry**: what the feature is, how it works and where it lives in the code | Upon completing the implementation |

Every feature file **must reference the source spec** (`Spec` field), guaranteeing bidirectional traceability: from the catalog to the process and back.

---

## Naming Conventions

- **File:** kebab-case, **English**, named after the feature — e.g., `plans-mode.md`, `session-persistence.md`, `skills-system.md`
- **Granularity:** one file per product feature (not per code file, not per release)
- **Change to an existing feature:** update the corresponding file ("Change History" section) instead of creating a new one
- **Removed feature:** mark the file with status `removed` in the header and record it in the CHANGELOG — don't delete it

---

## Feature Index

| Feature | Status | Code branch | Source spec |
|---------|--------|-------------|------------|
| [Terminal UI (TUI)](./terminal-ui.md) | active | `feat/ux-ui` | `specs/2026-08-25-tui-overhaul` + `2026-08-25-tui-premium` + `2026-08-25-tui-open-boxes` + `2026-08-25-prompt-multiline-fix` + `2026-08-25-dynamic-terminal-title` |
| [Agent Loop](./agent-loop.md) | active | `feat/agent-loop` | `specs/2026-08-25-project-structure` + `specs/2026-08-25-model-system` + `specs/2026-08-30-session-resilience` |
| [Built-in Tools](./built-in-tools.md) | active | `feat/tools-system` | `specs/2026-08-25-project-structure` |
| [Plans Mode](./plans-mode.md) | active | `feat/plans-mode` | `specs/2026-08-30-plans-compression-resilience` |
| [Context Compression](./context-compression.md) | active | `feat/context-compression` | `specs/2026-08-25-context-aware-compression` + `specs/2026-08-30-plans-compression-resilience` |
| [Model System](./model-system.md) | active | `feat/model-system` | `specs/2026-08-25-model-system` + `specs/2026-08-25-dynamic-model-catalog` + `specs/2026-08-25-context-aware-compression` + `specs/2026-08-30-plans-compression-resilience` + `specs/2026-08-30-dynamic-model-catalog-ui` + `specs/2026-08-30-model-search-picker` |
| [Project Rules (`.emilerules`)](./project-rules.md) | active | `feat/project-rules` | `specs/2026-08-25-rules-system` |
| [Session Resilience](./session-resilience.md) | active | `feat/session-system` | `specs/2026-08-30-session-resilience` |
| [Multi-level Undo](./multilevel-undo.md) | active | `feat/cli-commands` | `specs/2026-08-30-multilevel-undo` |
| [Error UX](./error-ux.md) | active | `feat/ux-ui` | `specs/2026-08-30-error-ux` |
| [MCP Integration](./mcp-integration.md) | active | `feat/mcp-system` | `specs/2026-08-30-mcp-tool-visibility` |
| [Skills System](./skills-system.md) | active | `feat/skills-system` | `specs/2026-08-30-skill-relevance` |
| [Open-source Quality Gates](./open-source-readiness.md) | active | `chore/quality-gates` | `specs/2026-08-30-open-source-readiness` |

All documentation, including this registry and the source specs, is committed
on `docs/documentation` rather than on the code branch listed above.
