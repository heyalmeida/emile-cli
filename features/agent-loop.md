# Feature: Agent loop

| Field | Value |
|-------|-------|
| **Status** | `active` |
| **Delivery date** | 2026-08-25 |
| **Source spec** | `specs/2026-08-25-project-structure` + `specs/2026-08-25-model-system` + `specs/2026-08-30-session-resilience` + `specs/2026-09-01-turn-interrupt-queue` |
| **PRD RFs served** | RF-01, RF-03, RF-08, RF-10, RF-13, RF-19 |
| **Owner/Area** | Agent Loop |

## Description

The agent loop turns one user request into a controlled sequence of model
responses, reasoning updates, tool calls and tool results. It continues until
the model produces a final response, while retaining session state and showing
progress in the terminal.

## How It Works

The loop builds the system prompt and tool definitions, streams the provider
response, assembles tool calls, executes them through built-in or MCP handlers,
persists checkpoints and repeats until no tool call remains. Context checks,
free-model fallback and iteration limits protect the turn.

## Technical Details

| Item | Detail |
|------|---------|
| **CLI flags** | `-p, --plans`, `-e, --effort`, `--no-cache`, `--max-loop-iterations <n>` |
| **Slash commands** | `/thinking`, `/cost`, `/maxloop <n>` |
| **Tools** | Built-in tools and MCP tool bridge |
| **Configuration** | Provider/model/effort in `.emile/config.json` and environment variables |
| **Iteration cap** | `maxLoopIterations` (default 40) via `EMILE_MAX_LOOP_ITERATIONS`, `--max-loop-iterations <n>`, or `/maxloop <n>` |
| **Interrupt/queue** | Esc/Ctrl+C during a turn request a graceful stop (partial text kept, pending tool calls dropped or placeholder-filled); the same full prompt frame queues sequential turns while active stdout is routed above it and the real cursor stays at the draft (`src/agent/turn-control.js`, `src/ui/turn-keys.js`, `src/ui/prompt-input-persistent.js`) |
| **Applicable security gates** | Tool handlers enforce safe mode, dry-run, whitelist and workspace paths |

## Where It Lives in the Code

| Layer | Main paths |
|--------|---------------------|
| Loop | `src/agent/agent.js` |
| Reasoning and telemetry | `src/agent/reasoning.js`, `src/agent/session-stats.js` |
| Compression | `src/agent/compression.js` |

## Known Limitations

Provider token estimates remain approximate when usage telemetry is absent, and
the loop is single-agent rather than parallel.

## Change History

| Date | Change | Reference |
|------|--------|-----------|
| 2026-08-30 | Registered the shipped agent-loop capability | `specs/2026-08-30-feature-registry-completion` |
| 2026-09-01 | Made the per-turn iteration cap configurable via `EMILE_MAX_LOOP_ITERATIONS`, `--max-loop-iterations` and the `/maxloop <n>` command | CHANGELOG |
| 2026-09-01 | Added graceful turn interrupt (Esc/Ctrl+C) and message queueing while the agent works | `specs/2026-09-01-turn-interrupt-queue` / CHANGELOG |
| 2026-09-01 | Serialized stdin ownership across the persistent prompt, active-turn input and `/switch`; restored Tab completion and post-picker typing | `specs/2026-09-01-turn-interrupt-queue` / CHANGELOG |
| 2026-09-02 | Replaced the compact active row with the shared full prompt frame; preserved drafts and the real caret across spinner/reasoning/output writes | `specs/2026-09-01-turn-interrupt-queue` / ADR-0003 |
