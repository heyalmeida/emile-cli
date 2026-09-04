# Spec: User-global agent memory

| Field | Value |
|-------|-------|
| **ID** | `2026-09-03-global-agent-memory` |
| **Status** | `implementing` |
| **Phase/Context** | Phase 3 — Agent Robustness |
| **Related documents** | [Research](research.md), [PRD](../../docs/product.md), [Architecture](../../docs/architecture.md), [ADR-0004](../../docs/adr/0004-global-agent-memory.md), [Security](../../docs/code-quality-and-security.md) |

---

## 1. Problem / Motivation

Emile persists conversations per workspace, but starts every unrelated workspace without durable knowledge of the user's stable preferences, recurring workflow and corrections. Repeating those instructions wastes time and tokens and produces inconsistent behavior.

The requested memory must be user-global rather than a collection of project silos. That broader scope also creates a high-risk trust boundary: model output is untrusted, memories can become stale or malicious, and personal data written outside the workspace must remain inspectable, bounded, recoverable and genuinely forgettable.

### 1.1 Research findings that govern this spec

| Source | Finding used in the design |
|--------|----------------------------|
| [Claude Code memory](https://code.claude.com/docs/en/memory) | Claude Code separates user-authored instructions from automatic notes, stores automatic memory locally, keeps a bounded index and loads detail lazily. Automatic memory is project-scoped, so Emile intentionally differs by providing one user-global store. |
| [Claude memory help](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context) | Claude's product memory represents role, people, communication/work style, technical style and project facts; project memories remain separate, incognito chats do not contribute, and derived memories have independent deletion controls. |
| [Claude context guidance](https://support.claude.com/en/articles/14553240-give-claude-context-claude-md-and-better-prompts) | Stable context benefits from prompt caching, while changing instruction files invalidates their content-addressed cache. Repeated correction is a stronger signal than a single inference. |
| [Anthropic model announcements](https://www.anthropic.com/news/claude-opus-4-8) | Opus 4.8 and the later [Fable 5](https://www.anthropic.com/news/claude-fable-5-mythos-5), [Opus 5](https://www.anthropic.com/news/claude-opus-5) and [Fable 5.1](https://www.anthropic.com/claude-fable-and-mythos-5-1) improve the reasoning engine, but the documented durable-memory behavior lives in the Claude/Claude Code product layer. Emile therefore cannot assume a provider model remembers the user. |
| [Memory in the Age of AI Agents](https://arxiv.org/abs/2512.13564) | Long-term agent memory includes factual and experiential memory plus memory dynamics; it is not equivalent to retrieving arbitrary documents. |
| [Memory in the LLM Era](https://arxiv.org/html/2604.01707v1) | A robust memory pipeline separates extraction, management, storage and retrieval; hierarchical, bounded retrieval preserves useful context better than injecting an unbounded flat history. |
| [Mosaic memory](https://www.nature.com/articles/s41467-026-68603-0) | Near-duplicate fragments can reinforce memorization and privacy exposure, motivating deduplication, bounded evidence and deletion across every retained copy. |
| Local `grok-build/crates/codegen/xai-grok-memory` review | Useful implementation patterns include storage/search separation, Markdown-aware lexical retrieval, diversity ranking, bounded background consolidation, token-owned locks, stale-lock recovery and rejection of symlinks/special files. It is a comparative source, not a dependency or code donor. |

**Design conclusion:** model intelligence may propose or rank a memory, but persistence, validation, conflict handling, retrieval, privacy and deletion are responsibilities of Emile's provider-agnostic client layer. MCP remains an extension protocol and is not the memory database.

## 2. Goal

Provide one local, user-global memory that lets Emile reliably reuse confirmed preferences, workflow conventions and recurring corrections across workspaces without storing raw conversations or letting memory override current user intent, project rules or security controls.

The feature is successful when a user can inspect, add, pause, accept, reject, search and forget memories; automatic learning is conservative; relevant context remains bounded; and corrupt, partial or concurrent writes never prevent the CLI from starting.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-------------|-------------------|
| RF-M01 | Store all durable memories under the versioned user-global root `~/.emile/memory/v1/`, independent of the current workspace and provider. | Must |
| RF-M02 | Represent each memory as a schema-validated record with ID, revision, type, state, normalized key, concise text, tags, activation mode, confidence, non-content provenance, timestamps, usage counters and sensitivity classification. | Must |
| RF-M03 | Support the memory types `user`, `workflow`, `feedback`, `fact` and `reference`; automatic promotion is limited to cross-project `user`, `workflow` and `feedback` knowledge. | Must |
| RF-M04 | Support `off`, `ask` and `auto` modes. Default to `ask` on first use; mode changes persist globally. | Must |
| RF-M05 | `/remember <text>` creates an active, explicit memory after validation. A private `proposeMemory` model tool may only create or strengthen a pending candidate; it cannot activate, overwrite or delete memory. | Must |
| RF-M06 | In `auto`, a candidate becomes active only after semantically equivalent user evidence from at least two distinct sessions. In `ask`, it remains pending until `/memory accept <id>`. | Must |
| RF-M07 | Formation evidence must be an exact, bounded span of the current user-authored message. This is necessary but not sufficient: task-specific, quoted third-party, instruction-like or security-bearing text is rejected. Assistant text, reasoning, tool output, files, web results and MCP results cannot serve as evidence. Raw evidence is validated in memory and discarded before persistence. | Must |
| RF-M08 | Deduplicate candidates by normalized key and similarity. Contradictions never silently overwrite active memory; they create a visible conflict that requires the user's choice. | Must |
| RF-M09 | Retrieve only active memories using deterministic lexical relevance, type/activation weights, bounded recency for feedback, usage boost and diversity selection. No extra model call is required for ordinary retrieval. | Must |
| RF-M10 | Inject at most 10 `always` memories and 6 relevant memories, within a combined 1,400-token estimate. Memory is dynamic, clearly delimited untrusted context attached to the current user turn; the frozen system-prompt prefix remains unchanged. | Must |
| RF-M11 | Apply precedence `current user request > project rules > active global memory > model inference`. Memory can never grant command approval, disable safe mode/dry-run/path controls, select credentials, or override higher-priority instructions. | Must |
| RF-M12 | Provide `/memory`, `/memory list [query]`, `/memory show <id>`, `/memory mode <off\|ask\|auto>`, `/memory pause`, `/memory resume`, `/memory accept <id>`, `/memory reject <id>`, `/memory doctor`, `/memory export`, `/memory clear`, `/remember <text>` and `/forget <id\|query>`. Destructive ambiguity or bulk deletion requires confirmation. | Must |
| RF-M13 | Provide a private read-only `recallMemory` model tool for explicit deeper lookup. Tool results obey the same state, budget, sensitivity and untrusted-context rules as automatic retrieval. | Should |
| RF-M14 | Persist a schema-versioned canonical snapshot plus a short write-ahead log. Writes use a token-owned exclusive lock, append-and-sync intent, atomic snapshot replacement and log truncation only after durable success. | Must |
| RF-M15 | Validate state on startup, replay only complete log records, retain a last-known-good snapshot, quarantine invalid artifacts and degrade to an empty read-only view with a bounded warning instead of crashing. | Must |
| RF-M16 | Bound contention and stale-lock recovery. Concurrent sessions must serialize writers and may refresh readers by revision without losing accepted updates. | Must |
| RF-M17 | Create directories with POSIX mode `0700` and memory files with `0600`; reject symlinks, FIFOs, devices and other non-regular store artifacts; confine every resolved path to the memory root. Unsupported permission semantics degrade with a verbose warning. | Must |
| RF-M18 | Reject secrets and high-risk identifiers before persistence, including credential-shaped values, private keys and financial/government identifiers. Sensitive personal topics are never learned automatically and require an explicit, warned `/remember`. | Must |
| RF-M19 | Store no raw chat, assistant reasoning, tool/file/web/MCP content, API key, shell command output or verbatim evidence. Provenance is limited to a non-reversible session reference, source kind and timestamps. | Must |
| RF-M20 | `/forget` and `/memory clear` purge matching content from the snapshot, write-ahead log, generated index and last-known-good copy and remove all quarantined memory artifacts whose content cannot be safely attributed. The UI must state that filesystem/media-level secure erasure is outside Emile's guarantee. | Must |
| RF-M21 | Cap memory at 500 active records, 100 pending/conflict records, 4,096 characters per record and 4 MiB per state artifact. A generated `MEMORY.md` overview is capped at 200 lines or 25 KiB and is never canonical. | Must |
| RF-M22 | `/memory pause` is session-local incognito mode: it disables retrieval, proposal and persistence without changing the global mode. `off` disables those operations globally until changed. | Must |
| RF-M23 | `--dry-run` performs no memory mutation. Safe mode remains authoritative and `--no-safe` does not relax memory validation or deletion confirmation. | Must |
| RF-M24 | Memory failures never block the agent loop, MCP, workspace sessions or shutdown. Warnings reveal paths/record IDs where useful but never memory content or rejected secrets. | Must |
| RF-M25 | Existing global provider configuration and workspace-local session, undo, web and MCP data remain backward compatible and separate from the memory store. | Must |
| RF-M26 | `/memory export` writes a content-bearing export only after explicit confirmation, confines its destination to the workspace through `resolveSafePath`, applies mode `0600`, excludes internal evidence/provenance, and never joins `/export` session output implicitly. | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|--------|
| **Risk classification** | **High.** The feature writes persistent personal context outside the workspace, consumes untrusted model proposals and influences future prompts across projects. |
| **Assets/secrets** | User preferences, workflow history, personal facts, record provenance, global settings and API credentials sharing the parent `~/.emile/` directory. |
| **Command execution / file writes** | Memory never executes commands. It introduces a separate least-authority path boundary rooted at `~/.emile/memory/v1/`; workspace tools continue to use `resolveSafePath`. Dry-run suppresses writes. |
| **Untrusted inputs** | User text, LLM tool arguments and locally edited/corrupt store files are schema-, size-, source-, path- and sensitivity-validated. Model output can only enqueue candidates. Retrieved memory is labeled untrusted and cannot authorize tools. |
| **Negative criteria** | No raw transcripts, silent conflict overwrite, secret retention, symlink escape, special-file read/write, unbounded store/context, cross-user path, memory-to-security override, direct model deletion, or fatal startup on corrupt state. |

The implementation must threat-model prompt injection that asks the agent to remember malicious instructions, malicious workspace content attempting to become a global rule, concurrent/torn writes, stale locks, manual corruption, identifier ambiguity, content leakage through verbose logs and residual copies after logical deletion.

## 5. Out of Scope

- Project-scoped automatic-memory silos; the requested durable store is user-global.
- Raw conversation recall, transcript search or silent import from existing sessions.
- Importing Claude, Codex or grok-build memory automatically.
- MCP as the memory persistence mechanism.
- Vector databases, embeddings, native SQLite modules or approximate-nearest-neighbor indexes in V1.
- Background model-based “dreaming”, autonomous consolidation or extra hidden LLM calls.
- Cloud sync, multi-device merge, multi-user profiles, encryption at rest or OS keychain integration.
- Memories that execute actions, approve tools or modify project rules.
- Filesystem/media-level secure erasure guarantees.

### 5.1 Scope change

On 2026-09-04, after approving the design, the user explicitly requested the runtime integration. The implementation, verification and documentation closeout described by this spec are therefore in scope; its requirements and acceptance criteria are unchanged.

## 6. Acceptance Criteria

- **AC-01:** Given two different workspaces, when an active memory is created in one and Emile starts in the other, then both resolve the same versioned user-global store and no project memory copy is created.
- **AC-02:** Given first use, when memory initializes, then mode is `ask`, the directory/file permissions are restrictive where supported, and existing provider configuration remains readable.
- **AC-03:** Given `/remember` with valid non-sensitive text, when the user confirms where required, then an active deduplicated record is durably committed and immediately inspectable.
- **AC-04:** Given a model proposal based on assistant, tool, file, web or MCP text rather than an exact current-user span, when validation runs, then it is rejected without writing content.
- **AC-05:** Given `ask` or `auto`, when one inferred preference appears once, then it is not active; in `auto`, equivalent evidence from a second distinct session may activate it, while a conflict remains pending.
- **AC-06:** Given current instructions, project rules and a conflicting active memory, when context is assembled, then current instructions and project rules win and memory cannot change security gates.
- **AC-07:** Given a large valid store, when a turn starts, then automatic retrieval returns no more than 10 always + 6 relevant records and stays within the 1,400-token estimate without changing the frozen prompt prefix.
- **AC-08:** Given a concurrent writer, stale lock, torn log tail, corrupt snapshot, symlink or special file, when memory initializes or writes, then it either recovers within bounded retries or degrades without data escape or an unhandled CLI crash.
- **AC-09:** Given secret-shaped or high-risk identifier text, when automatic or explicit formation is attempted, then automatic persistence is denied; sensitive explicit persistence requires a warning and confirmation, and credentials/private keys remain denied.
- **AC-10:** Given `/forget` or confirmed `/memory clear`, when deletion completes, then matching content is absent from every Emile-managed live, recovery, derived and quarantined memory artifact.
- **AC-11:** Given `off`, session-local pause or `--dry-run`, when a turn proposes or retrieves memory, then the prohibited read/write operations do not occur and the user-visible status is accurate.
- **AC-12:** Given a retrieval/store failure, when the agent runs a normal task, then the task continues without memory and a bounded, content-free diagnostic is available.
- **AC-13:** Given ambiguous `/forget <query>` or `/memory clear`, when the command runs, then the UI previews identifiers and requires confirmation; cancellation makes no changes and restores readline state.
- **AC-14:** Given a memory export, when confirmed, then its destination is workspace-confined, the file has restrictive permissions, internal evidence/provenance is excluded and it is never embedded in a session export automatically.
- **AC-15:** Given existing session, undo, MCP, web and provider configuration fixtures, when the memory feature is enabled, disabled or corrupt, then their storage locations and behavior remain unchanged.
- **AC-16:** Given narrow terminal width, interruption or nested picker use, when a memory command renders or requests confirmation, then output follows the visual system, remains bounded/sanitized and restores prompt ownership.

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|--------|-------------------|
| A false memory changes behavior across every project | High | Conservative `ask` default, two-session auto threshold, explicit conflicts, priority rules and full inspection/deletion controls. |
| Global memory breaks workspace path confinement | High | Introduce a documented memory-only capability root and resolver; never pass that resolver to general file tools. Update the mandatory rule before runtime implementation. |
| Crash or concurrent terminals lose data | High | Lock ownership tokens, bounded stale recovery, WAL, atomic rename, fsync where available, revision refresh and fault-injection tests. |
| “Forget” leaves recoverable application copies | High | Purge canonical, WAL, backup, overview and quarantine in one locked operation; document the limit on physical media erasure. |
| Lexical retrieval misses paraphrases | Medium | Normalized tokens, bilingual stopwords, tags, query expansion and diversity. Evaluate before introducing embeddings in a separate ADR/spec. |
| Global facts accidentally encode a project detail | Medium | Automatic promotion is restricted to user/workflow/feedback types; facts/references require explicit action. Workspace origin is metadata, not a storage silo. |
| Store grows or prompt cache degrades | Medium | Hard record/artifact/context caps and dynamic injection outside the frozen system prefix. |
| Local plaintext is readable by a compromised account | Medium | `0700`/`0600`, data minimization and explicit export; encryption is deferred and must be clearly disclosed. |

No blocking product question remains for V1. The conservative `ask` default is intentional; `auto` is an informed opt-in.

## 8. References

- Product and architecture: [PRD](../../docs/product.md), [Architecture](../../docs/architecture.md), [Roadmap](../../docs/roadmap.md), [Glossary](../../docs/glossary.md), [Visual identity](../../docs/visual-identity.md), [Code quality and security](../../docs/code-quality-and-security.md), [ADR-0001](../../docs/adr/0001-tech-stack-choice.md), [ADR-0004](../../docs/adr/0004-global-agent-memory.md).
- Related specs: [Project rules](../2026-08-25-rules-system/spec.md), [Context-aware compression](../2026-08-25-context-aware-compression/spec.md), [Session lifecycle](../2026-09-02-session-lifecycle/spec.md), [MCP resilience](../2026-08-30-mcp-resilience-transports/spec.md).
- External research: sources listed in § 1.1 and the detailed [research note](research.md), accessed on 2026-09-03.
