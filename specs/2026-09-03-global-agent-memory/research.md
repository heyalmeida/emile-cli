# Research: persistent memory for a user-global CLI agent

> Researched on 2026-09-03. Product behavior is time-sensitive; the linked primary sources are authoritative over this snapshot.

## 1. Executive conclusion

Claude's current public documentation describes durable memory as a **product/client facility around the model**, not as private facts permanently learned into a selected Opus or Fable model during ordinary use. Claude Code assembles explicit instruction files and locally stored automatic notes into a fresh session context. Claude's hosted product maintains a separate memory service with user controls and project boundaries.

The official Opus 4.8, Fable 5, Opus 5 and Fable 5.1 announcements describe model capability, deployment and safety changes but do not document a separate persistent-memory store or lifecycle for each model. The defensible inference is that newer models can improve extraction, conflict reasoning and retrieval decisions, while the application remains responsible for storage, access control, injection, deletion and portability.

For Emile, memory should consequently be native, provider-agnostic and independently testable. MCP can expose optional external data, but it should not be required for the core memory lifecycle.

## 2. Claude Code: explicit instructions and automatic memory

The [Claude Code memory documentation](https://code.claude.com/docs/en/memory) describes two mechanisms that are both supplied as context:

| Mechanism | Ownership and scope | Loading/management | Emile implication |
|-----------|---------------------|--------------------|-------------------|
| `CLAUDE.md` and `.claude/rules/` | Human-authored instructions at managed, user and project levels; project instructions are more specific | Loaded into session context and inspectable through `/memory`; changes can alter the prompt prefix | Keep project rules explicit and higher-priority than inferred global memory. Do not silently rewrite them. |
| Auto memory | Claude-selected notes stored locally per project under `~/.claude/projects/<project>/memory/` | `MEMORY.md` is an index; only its first 200 lines or 25 KiB are loaded initially, and topic files are read on demand | Reuse bounded overview + lazy detail as a pattern, but intentionally replace project silos with one global Emile store. |

Claude Code's documented auto-memory categories include `user`, `feedback`, `project` and `reference`. It tries not to store facts that can be rediscovered from the codebase or instructions. Users can inspect/delete notes and disable automatic memory. These controls support three requirements for Emile: data minimization, candidate provenance and first-class inspection/forget commands.

The key product difference is scope. Claude Code's auto-memory directory is keyed by project; Emile's requested memory is keyed by the local user and spans workspaces. Emile should still preserve workspace origin as low-authority relevance metadata so a narrow project observation does not become a universal rule.

## 3. Claude hosted product: memory controls and privacy behavior

The [Claude memory help article](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context) describes topic memories formed as conversations happen. Examples include role/context, people and places, communication/work style, technical/coding style and project details.

Important controls and boundaries are:

- project memories remain separate rather than automatically crossing projects;
- incognito chats do not contribute to memory;
- users can inspect and remove individual memories;
- deleting a source conversation and deleting a derived memory are distinct operations;
- certain sensitive categories are not saved automatically, and the service describes encryption at rest for hosted data.

Emile is local-first and cannot claim hosted-service encryption. It can adopt the safer product semantics: session pause/incognito, separate derived-memory deletion, explicit sensitive-topic handling, restrictive filesystem permissions and exports that never happen implicitly.

## 4. Opus 4.8+, Fable 5 and Fable 5.1

| Release | Official source | Finding relevant to memory |
|---------|-----------------|----------------------------|
| Claude Opus 4.8 | [Anthropic announcement](https://www.anthropic.com/news/claude-opus-4-8) | A newer reasoning/coding model; no release-specific persistent user-memory lifecycle is documented. |
| Claude Fable 5 / Mythos 5 | [Anthropic announcement](https://www.anthropic.com/news/claude-fable-5-mythos-5) | New model tier/capabilities; durable memory continues to be described in Claude product and Claude Code documentation. |
| Claude Opus 5 | [Anthropic announcement](https://www.anthropic.com/news/claude-opus-5) | Later flagship model; no separate model-owned personal memory management contract is published. |
| Claude Fable 5.1 / Mythos 5.1 | [Anthropic announcement](https://www.anthropic.com/claude-fable-and-mythos-5-1) | Fable and Mythos use the same underlying model with different safeguards, reinforcing that deployment/product policy can differ independently of model weights. No distinct persistent-memory backend is specified. |

This is an inference from the separation in Anthropic's primary documentation, not a claim about undisclosed internal implementation. The architecture should not assume that a model ID guarantees persistence, isolation, deletion or recall.

Prompt caching further supports that separation. Anthropic's [context guidance](https://support.claude.com/en/articles/14553240-give-claude-context-claude-md-and-better-prompts) notes that instruction-file content participates in content-addressed prompt caching and changes invalidate the corresponding cache. Emile should keep selected memories out of its frozen system prefix and inject only a bounded turn projection.

## 5. Supplied research papers

| Research | Relevant result | Design response |
|----------|-----------------|-----------------|
| [Memory in the Age of AI Agents](https://arxiv.org/abs/2512.13564) | Treats agent memory as factual/experiential/working forms plus explicit memory dynamics, rather than generic document RAG. | Store durable user/workflow/feedback records with lifecycle state; do not call session history or arbitrary file search “memory.” |
| [Memory in the LLM Era](https://arxiv.org/html/2604.01707v1) | Separates extraction, management, storage and retrieval and reports value from bounded hierarchical organization. It also highlights semantic loss when source context is discarded. | Use separate modules and a compact index/detail representation. Emile deliberately keeps only non-content provenance instead of raw context, accepting lower forensic recall to reduce privacy exposure. |
| [Mosaic memory](https://www.nature.com/articles/s41467-026-68603-0) | Studies memorization arising from distributed, fuzzy duplicate fragments rather than only exact duplicates. | Normalize/deduplicate candidates, diversify retrieval, cap repetition and purge every application-managed copy on forget. |

## 6. Local grok-build comparison

The ignored local `grok-build/crates/codegen/xai-grok-memory` implementation is useful as a comparative engineering source:

- it separates storage, indexing, search, observation and consolidation;
- it keeps inspectable Markdown while building a search index;
- lexical FTS remains available when vector search is absent;
- results combine source/temporal/access weights and use diversity selection;
- consolidation uses a token-owned lock, bounded scheduling and a commit marker after success;
- archive/reader paths reject symlinks and special files and cap input size.

Emile adopts the principles of separated responsibilities, lexical fallback, diversity, lock ownership, bounded recovery and hostile-file handling. It does **not** copy the Rust code, require SQLite/vector extensions, adopt project-scoped stores or run autonomous background consolidation in V1.

## 7. Resulting design rules

1. The application owns persistence; the active LLM is replaceable.
2. Explicit user memory and inferred candidates are different trust levels.
3. A user-authored span is necessary evidence, but not sufficient authorization for a global instruction.
4. One inference is not durable truth; cross-session corroboration or explicit acceptance is required.
5. Current intent and project rules outrank memory, and security gates are outside memory authority.
6. Retrieval must be bounded, diverse and cache-aware.
7. The store needs transactional recovery and concurrency controls despite remaining small/local.
8. No raw transcript or tool/file/web/MCP result belongs in durable memory.
9. Pause, inspect, conflict resolution, export and full application-level forget are core behavior, not optional administration.
10. Embeddings, cloud sync, encryption and autonomous consolidation require evidence and separate future decisions.
