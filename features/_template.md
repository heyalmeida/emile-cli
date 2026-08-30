# Feature: [Feature Name]

| Field | Value |
|-------|-------|
| **Status** | `active` |
| **Delivery date** | YYYY-MM-DD |
| **Source spec** | `specs/YYYY-MM-DD-spec-name` |
| **PRD RFs served** | E.g., RF-01, RF-04 |
| **Owner/Area** | E.g., Agent Loop / UI / Tools / MCP / Skills |

---

## Description

*What the feature does, in 1-3 paragraphs, in product language (not code language).*

## How It Works

*Summary flow of the feature from the user's and the system's point of view. Mermaid diagram when it helps (follow Rule 5 of `.clinerules`).*

## Technical Details

| Item | Detail |
|------|---------|
| **CLI flags** | E.g., `-p, --plans` |
| **Slash commands** | E.g., `/undo`, `/cost` |
| **Tools** | E.g., `readFile`, `writeFile`, `runCommand` |
| **Configuration** | E.g., environment variables, `.emile/config.json`, `mcp.json` |
| **Applicable security gates** | E.g., safe mode, dry-run, whitelist, `resolveSafePath` |

## Where It Lives in the Code

| Layer | Main paths |
|--------|---------------------|
| Main module | `src/...` |
| Support | `src/...` |

## Known Limitations

*What the feature does NOT do today (and whether there is a related future spec/plan).*

## Change History

| Date | Change | Reference |
|------|---------|------------|
| YYYY-MM-DD | Feature created | Source spec / CHANGELOG |
