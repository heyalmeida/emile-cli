# Feature: Context compression

| Field | Value |
|-------|-------|
| **Status** | `active` |
| **Delivery date** | 2026-08-25 |
| **Source spec** | `specs/2026-08-25-context-aware-compression` + `specs/2026-08-30-plans-compression-resilience` |
| **PRD RFs served** | RF-13, RF-19 |
| **Owner/Area** | Agent Loop / Model System |

## Description

Emile protects long conversations by comparing the complete request estimate
with the active model's real context window. When the 80% threshold is reached,
older history is summarized while recent context remains available.

## How It Works

The agent estimates system prompt, tools and messages before each initial API
call. Successful compression requires meaningful history growth before it can
repeat. If summarization fails, the agent falls back to dropping the oldest
complete groups toward 70% without failing the turn.

## Technical Details

| Item | Detail |
|------|---------|
| **CLI flags** | None |
| **Slash commands** | `/cost` shows context usage |
| **Tools** | None |
| **Configuration** | Active model catalog metadata and `maxLoopIterations` |
| **Applicable security gates** | No file or shell access; summarized content remains in memory |

## Where It Lives in the Code

| Layer | Main paths |
|--------|---------------------|
| Compression gate | `src/agent/compression.js` |
| Payload estimate | `src/agent/session-stats.js`, `src/agent/agent.js` |
| Model window | `src/models.js` |

## Known Limitations

Token estimation uses a character approximation when providers do not report
usage, and provider-specific tokenizers are not included.

## Change History

| Date | Change | Reference |
|------|--------|-----------|
| 2026-08-30 | Registered model-window compression and safe fallback | `specs/2026-08-30-feature-registry-completion` |
