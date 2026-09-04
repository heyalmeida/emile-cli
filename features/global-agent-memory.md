# Feature: Global Agent Memory

| Field | Value |
|-------|-------|
| **Status** | `active` |
| **Delivery date** | 2026-09-04 |
| **Source spec** | `specs/2026-09-03-global-agent-memory` |
| **PRD RFs served** | RF-05, RF-07, RF-14, RF-15, RF-21 |
| **Owner/Area** | Agent Loop / Memory / Tools / UI |

---

## Description

Emile remembers confirmed user preferences, workflow conventions and recurring corrections across unrelated workspaces and OpenAI-compatible providers. The memory belongs to the local user rather than to a project, so a preferred response style or stable working convention does not need to be taught again in every repository.

The user remains in control: first use defaults to conservative `ask` mode; inferred knowledge is only a candidate; conflicts require an explicit choice; and all records can be inspected, paused, exported or forgotten. Current requests and project rules always outrank memory.

## How It Works

1. `/remember` validates and stores explicit user-authored memory. The model-facing `proposeMemory` tool can only submit a pending candidate backed by an exact span of the current user message.
2. In `ask`, the user accepts candidates. In opt-in `auto`, equivalent evidence from two distinct sessions may activate one; contradictions remain conflicts.
3. Each user turn retrieves a deterministic, diverse and token-bounded set of active records. The result is attached only to the transient current-user request sent to the provider, never to the frozen system-prompt prefix or persisted session.
4. A schema-versioned snapshot, short write-ahead log, backup and generated overview are serialized by a token-owned lock. Startup replays or quarantines bounded artifacts and degrades without blocking normal agent use.
5. `/forget` and `/memory clear` rewrite every Emile-managed live/recovery view and remove quarantined copies. Physical storage-media erasure is outside the guarantee.

## Technical Details

| Item | Detail |
|------|---------|
| **CLI flags** | No new flag; existing `--dry-run` suppresses memory mutations |
| **Slash commands** | `/memory`, `/remember`, `/forget` and the status/list/show/mode/pause/resume/accept/reject/doctor/export/clear subcommands |
| **Tools** | Private strict `proposeMemory`; private read-only `recallMemory` |
| **Configuration** | Global state at `~/.emile/memory/v1/`; persisted modes `off`, `ask`, `auto`; pause is process-local |
| **Applicable security gates** | Dedicated `resolveSafePath` capability root, symlink/FIFO rejection, `0700`/`0600`, schema/size caps, exact current-user evidence, secret/identifier denial, sensitive-data confirmation, untrusted-context precedence, dry-run and destructive confirmation |

## Where It Lives in the Code

| Layer | Main paths |
|--------|---------------------|
| Main module | `src/memory/` |
| Agent/context integration | `src/agent/agent.js`, `src/prompt.js`, `src/history.js` |
| Commands and private tools | `src/commands/memory.js`, `src/tools/definitions.js`, `src/tools/handlers/memory.js` |
| UI and lifecycle | `src/ui/memory-panel.js`, `src/lifecycle/flush-memory.js`, `src/cli.js` |
| Verification | `test/memory-*.test.js`, `test/agent-memory.test.js` |

## Known Limitations

- Retrieval is lexical in V1; there are no embeddings, vector database or hidden model consolidation calls.
- The local store is plaintext protected by filesystem permissions, not encrypted at rest or synchronized between devices.
- Automatic formation is limited to user/workflow/feedback knowledge and requires model proposal plus deterministic client validation.
- The store is capped at 500 active and 100 pending/conflict records; the transient context is capped at 10 always-on plus 6 relevant records and a 1,400-token estimate.
- Forgetting removes Emile-managed copies but cannot guarantee physical storage-media secure erasure.

## Change History

| Date | Change | Reference |
|------|---------|------------|
| 2026-09-04 | Feature created and integrated across storage, agent, commands, tools, UI and lifecycle | `specs/2026-09-03-global-agent-memory`, ADR-0004, CHANGELOG |
