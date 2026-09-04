# ADR-0004: Native user-global agent memory

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-09-03 |
| **Decision owners** | emile-cli maintainers |
| **Related spec** | [`2026-09-03-global-agent-memory`](../../specs/2026-09-03-global-agent-memory/spec.md) |

## Context

Emile currently persists conversations and operational state per workspace. It has no provider-independent way to retain a user's stable preferences, workflow conventions or recurring corrections across unrelated projects.

Contemporary Claude product documentation distinguishes the model from the memory facility around it: Claude and Claude Code select, persist and retrieve memory in the product/client layer, while individual model releases provide the reasoning used by that layer. Claude Code's automatic memory is local and project-scoped, whereas the requested Emile behavior is explicitly user-global.

The solution must preserve Emile's pure JavaScript, no-build, provider-agnostic architecture and prompt-cache stability. It also writes personal data outside the workspace, so reusing the general workspace tool path would either violate confinement or broaden general tool authority.

## Decision

Emile will implement memory as a native, provider-agnostic client subsystem with these boundaries:

1. **One versioned user-global store.** Durable state lives under `~/.emile/memory/v1/`; it is not partitioned by workspace or provider. Workspace origin may contribute non-content relevance metadata but is not a separate memory silo.
2. **Separate memory pipeline.** Formation, management, storage/recovery and retrieval are distinct modules. Model intelligence can propose a candidate, but validated Emile code owns every state transition.
3. **Conservative activation.** First use defaults to `ask`. Explicit `/remember` can create an active entry; inferred entries are pending and automatic activation requires corroboration in two distinct sessions. Conflicts require the user.
4. **Structured canonical state.** A schema-versioned JSON snapshot and short write-ahead log are canonical. A bounded `MEMORY.md` file is a generated human-readable view only. No native database or vector dependency is introduced in V1.
5. **Crash-safe bounded writes.** Mutations use a token-owned exclusive lock, durable intent record, atomic snapshot replacement, last-known-good recovery and bounded artifact sizes. Invalid files are quarantined; memory failure cannot prevent CLI startup.
6. **Dedicated least-authority path capability.** A memory-only wrapper supplies the real `~/.emile/memory/v1/` capability root to `resolveSafePath`, rejects symlinks and non-regular files and is not exported to general tools. Workspace file tools keep the default workspace root.
7. **Data minimization and real application-level deletion.** No raw conversations, tool results, file/web/MCP content, reasoning, credentials or verbatim evidence are retained. Forgetting purges every Emile-managed canonical, recovery, derived and quarantined copy containing the selected memory.
8. **Deterministic bounded retrieval.** Lexical scoring, metadata weights and diversity choose active memories without an extra model call. Dynamic memory context is attached to the current user turn within a 1,400-token estimate and never mutates the frozen system-prompt prefix.
9. **Instruction hierarchy.** Current user intent and project rules outrank global memory. Memory is untrusted context and cannot authorize commands, disable gates, choose credentials or change its own privileges.
10. **MCP independence.** MCP may coexist with memory but is neither the persistence layer nor required for retrieval. Memory behaves consistently across OpenAI-compatible providers and model families.

## Consequences

### Positive

- Stable preferences and corrections follow the user across projects and providers.
- The model cannot directly corrupt, activate, delete or privilege persistent state.
- The store is inspectable and recoverable with Node.js built-ins and no build/native dependency.
- Prompt caching retains a stable system prefix; memory pays context cost only when selected for a turn.
- Memory remains available when MCP servers or provider-specific features are unavailable.

### Negative

- Lexical retrieval is less semantically flexible than embeddings and requires evaluation with paraphrases.
- Atomic durability and cross-process locking add substantial implementation and fault-injection work.
- Local plaintext protected by filesystem permissions is not encryption at rest.
- A user-global scope amplifies false or stale memories, requiring conservative defaults and visible management.
- The shared confinement primitive becomes security-critical for both workspace and memory roots and requires regression tests for each boundary.

## Alternatives considered

| Alternative | Decision | Reason |
|-------------|----------|--------|
| Use only provider-native memory | Rejected | Not portable across providers, not consistently exposed through OpenAI-compatible APIs and outside Emile's lifecycle/privacy controls. |
| Store memory through MCP | Rejected | Makes a core behavior depend on optional external infrastructure and expands trust/availability failure modes. |
| Copy Claude Code's project-scoped layout | Rejected | Contradicts the product requirement that preferences follow the user globally. |
| Append-only Markdown as canonical state | Rejected | Easy to inspect but weak for atomic updates, conflict state, validation and complete deletion. Markdown remains a derived view. |
| SQLite FTS/vector search in V1 | Deferred | Useful at greater scale, but a new/native dependency is unnecessary for bounded V1 and conflicts with the no-native baseline. |
| Store or search raw session transcripts | Rejected | Increases privacy exposure, prompt-injection persistence and deletion complexity without being necessary for stable preferences. |
| Put retrieved memory in the frozen system prompt | Rejected | Every memory change would destabilize prompt caching and would give memory excessive instruction authority. |

## Follow-up

- Implement only through the approved spec and plan.
- Evaluate lexical retrieval quality and store size after delivery before proposing embeddings or consolidation.
- Any encryption, sync, automatic import or database backend requires a separate spec and ADR.
