# Plan: User-global agent memory

| Field | Value |
|-------|-------|
| **Spec** | `2026-09-03-global-agent-memory` |
| **Status** | `approved` |

---

## 1. Technical Approach

Implement a lazily loaded `src/memory/` domain independent of providers, MCP and workspace session persistence. Its public API owns initialization, retrieval, candidate formation, explicit mutations, diagnostics and shutdown flushing; lower modules separately own schema, paths, locking, durable storage, privacy and ranking.

### 1.1 State layout

The default root is `~/.emile/memory/v1/`; tests inject an explicit temporary root and production code never accepts a model-provided root.

| Artifact | Role | Canonical |
|----------|------|-----------|
| `store.json` | Schema version, monotonically increasing revision, global mode, active records and pending/conflict candidates | Yes |
| `wal.ndjson` | Short transaction intent log replayed after an interrupted mutation | Yes, only until checkpointed |
| `store.json.bak` | Last validated snapshot used for bounded recovery | Recovery only |
| `MEMORY.md` | Human-readable, bounded overview for inspection; generated from `store.json` | No |
| `.lock` | Exclusive writer token with PID, nonce and timestamp | No |
| `quarantine/` | Invalid artifacts moved out of the active read path | No; purge is included in forget/clear |

`store.json` contains only validated structured records. Each mutation acquires the lock, refreshes the latest revision, validates its transition, appends one newline-complete WAL event and syncs it, writes/syncs a same-directory temporary snapshot, rotates the validated backup, renames atomically, syncs the parent directory where supported, regenerates the overview, truncates/syncs the WAL and releases only the lock token it owns.

Startup validates the main snapshot, then the backup, and replays only complete, checksum-valid WAL events newer than the chosen revision. Invalid artifacts are quarantined with content-free diagnostics. If no consistent state remains, memory opens empty and read-only for that process; the agent loop still starts.

### 1.2 Record and state transitions

Records use stable random IDs and a normalized semantic key. The expected schema includes:

- `schemaVersion`, `id`, `revision`, `type`, `state`, `key`, `text`, `tags` and `activation`;
- `confidence`, `sourceKind` and a non-reversible `sourceSessionRef`;
- `createdAt`, `updatedAt`, `lastUsedAt`, `useCount` and `evidenceSessionCount`;
- `sensitivity`, plus conflict references that contain IDs rather than copied text.

Raw evidence exists only during validation. `proposeMemory` must provide an exact span from the current user message; the handler checks source offsets/string identity, length, sensitivity, allowed type and stable-preference shape before dropping the evidence. Task-specific, quoted third-party, imperative/security-bearing or unsupported content is rejected. Emile computes the normalized key and confidence rather than trusting model-supplied values. The agent cannot submit a candidate after tool/file/web/MCP text and cannot call mutation primitives directly.

State transitions are explicit:

```text
proposed -> rejected
proposed -> pending -> rejected
proposed -> pending -> active
active + equivalent evidence -> active (strengthened)
active + contradiction -> conflict -> user chooses active revision
active -> forgotten (content purged; no content-bearing tombstone)
```

The store may retain a content-free operation revision after deletion, but never deleted text, tags or hashes derived directly from that text.

### 1.3 Retrieval and context integration

Tokenize the current user message and optional `recallMemory` query with Unicode normalization, case folding, punctuation removal and small Portuguese/English stopword sets. Score exact normalized-key matches, token/tag overlap, activation/type weights, feedback recency and capped use frequency. Apply maximal marginal relevance with Jaccard similarity to avoid near-duplicate results.

Select `always` entries first, then relevant entries, while enforcing both count limits and a shared 1,400-token estimate. Retrieval updates usage counters on a best-effort batched write that must not delay or fail the turn.

`src/agent/agent.js` requests a memory context before the initial API call. `src/memory/context.js` emits a delimited data block with source IDs, explicit precedence and an instruction that its content cannot authorize actions. The block is appended to the current user message projection sent to the API, without mutating the user's persisted message or the frozen system prompt. Subsequent tool-loop iterations reuse the same per-turn projection.

### 1.4 Commands and user control

Slash handlers call the memory API, never storage internals. `/memory` shows status, counts, mode, pause state and health without dumping content; list/show/search are explicit. `/remember`, accept/reject/forget/clear and export validate ambiguity and use UI-layer confirmation. Pause is held in REPL/session runtime only and is reset on process restart.

`MEMORY.md` is not edited as authoritative input. `/memory doctor` validates paths, artifacts, permissions, schema, WAL, lock state, caps and derived-view drift; repair requires explicit confirmation and never guesses lost record content.

### 1.5 Integration order

1. Clarify the mandatory path rule and land schema/path/privacy/storage primitives with fault tests.
2. Land candidate formation and deterministic retrieval/context projection.
3. Land commands, private tools and TUI surfaces.
4. Integrate shutdown, dry-run and agent loop; run regression/fault/manual gates.
5. Synchronize user documentation and feature registry, then close the spec.

## 2. Architectural Compliance

- **Relevant ADRs:** [ADR-0001](../../docs/adr/0001-tech-stack-choice.md) is preserved: Node.js ≥18, pure ESM, no build/native dependency. [ADR-0004](../../docs/adr/0004-global-agent-memory.md) records the new subsystem, durability and path boundary.
- **Architecture document:** implementation adds a `memory/` domain, one dynamic agent-loop input and lifecycle flushing. The module table, runtime directories, diagrams and loop invariants must be updated in the implementation commit.
- **Mandatory path rule:** before runtime code, Rule 4.5 in `.clinerules`/`AGENTS.md` must distinguish workspace writes through `resolveSafePath` from internal global-state writes through a dedicated root-confined resolver. This adds a narrower capability; it does not expose arbitrary home-directory access to tools.
- **Design system:** memory commands use only `src/ui/` and the exported `C` palette. Before UI implementation, document the list/detail/status/confirmation treatment in [visual identity](../../docs/visual-identity.md); verify widths below 80 columns and prompt ownership.
- **Provider and MCP boundaries:** no provider-specific branches in memory and no MCP dependency. Memory tool definitions are ordinary private built-ins; retrieved content is the same for compatible providers.
- **Prompt caching:** the stable memory policy may live in the frozen base prompt, but selected records never do. Dynamic records attach to the per-turn user projection.

## 3. Security and Threat Model

| Element | Handling |
|---------|----------|
| Command execution and whitelist | Memory executes no commands and cannot synthesize approval. Safe mode, whitelist, `--no-safe` and shell handling remain unchanged; `--no-safe` does not relax memory controls. |
| File writes and path confinement | Production root derives from the real user home plus fixed components. Resolve the real root/nearest existing ancestor, reject escape and special files, use `0700`/`0600`, same-directory temporary files and a memory-only resolver unavailable to general tools. |
| LLM inputs and prompt injection | `proposeMemory` accepts only an exact span of the current user message plus allowlisted metadata. Model proposals remain candidates. Memory context is delimited untrusted data below current instructions/project rules. |
| Secrets and personal data | Reject credential patterns, private-key blocks and financial/government identifiers. Sensitive topics are excluded from automatic formation and require warned explicit input. Logs and errors contain only safe codes/IDs. |
| Concurrency and partial writes | Exclusive `wx` lock with PID/nonce/token, ownership-checked release, bounded retry/jitter, conservative stale recovery, WAL checksum and revision compare-and-swap behavior. |
| Corrupt/manual state | Schema/size validation before use, symlink/special-file refusal, backup/WAL recovery, quarantine, generated-view rebuild and empty read-only degradation. Never parse Markdown as instructions. |
| Deletion and export | Forget/clear scan and rewrite every attributable artifact under a lock and remove all quarantined memory artifacts. Export is opt-in, sanitized, workspace-confined through `resolveSafePath`, `0600` and separate from session export. Warn that storage-media secure erase is not guaranteed. |
| Resource exhaustion | Record, queue, file, line, query, result and context caps; bounded retries/timeouts; no unbounded recursive traversal or background model call. |
| Controls and negative tests | Cover traversal/symlink/FIFO, poisoned JSON/NDJSON, torn writes, lock theft/staleness, simultaneous writers, secret variants, malicious workspace prompts, ambiguity, cap overflow, off/pause/dry-run and full managed-copy purge. |

The sensitivity classifier is a deny gate, not a promise of perfect PII detection. Tests must use synthetic credentials/identifiers only.

## 4. Impacted Modules

| Module | Path | Change |
|--------|------|--------|
| Memory facade | `src/memory/index.js` | Lazy public API for status, retrieval, proposal, mutations, health and flush. |
| Schema/model | `src/memory/schema.js` | Record/state validation, caps, version and legal transitions. |
| Path boundary | `src/memory/path.js` | Production/test root resolution, containment, file type and permission checks. |
| Durable store | `src/memory/store.js` | Snapshot/WAL transaction, atomic replacement, recovery and revision refresh. |
| Writer lock | `src/memory/lock.js` | Token-owned exclusive lock, bounded contention and stale-lock handling. |
| Privacy | `src/memory/privacy.js` | Secret/high-risk/sensitive-topic classification and content-free diagnostics. |
| Formation | `src/memory/formation.js` | Evidence validation, normalized keys, deduplication, corroboration and conflicts. |
| Retrieval | `src/memory/retrieval.js` | Query normalization, lexical score, temporal/type weights and diversity selection. |
| Context | `src/memory/context.js` | Bounded token projection and untrusted-context delimiter. |
| Commands | `src/commands/index.js`, `src/commands/handlers.js` | Register and dispatch the memory command family. Split handlers if current module size/responsibility warrants it. |
| Tool schemas/handlers | `src/tools/definitions.js`, `src/tools/handlers/`, `src/tools/index.js` | Private `proposeMemory` and read-only `recallMemory` with strict source/state gates. |
| Agent loop | `src/agent/agent.js` | Retrieve once per turn, preserve frozen prompt, bind valid current-user evidence and reuse projection. |
| Lifecycle | `src/lifecycle/` | Best-effort bounded memory flush after tools/session and before terminal restoration. |
| Configuration/runtime | `src/config.js`, `src/cli.js` | Load global mode, session-local pause and dry-run wiring with lazy imports. |
| UI | `src/ui/`, `src/ui/index.js` | Sanitized bounded list/detail/status, confirmation and diagnostics rendering. |

Keep each new source file near the repository's 150-line maintainability target. Split storage recovery or command UI further if a file would combine responsibilities.

## 5. Impacted Flags / Slash Commands / Tools

| Type | Name | Change |
|------|------|--------|
| CLI flag | None in V1 | Avoid redundant startup flags; persisted mode and session pause are explicit commands. Existing `--dry-run` is honored. |
| Slash command | `/memory` | Status and command-family entry point. |
| Slash command | `/memory list [query]`, `/memory show <id>` | Inspect bounded active/pending/conflict entries. |
| Slash command | `/memory mode <off\|ask\|auto>` | Persist the global formation/retrieval mode. |
| Slash command | `/memory pause`, `/memory resume` | Toggle incognito behavior for the current process/session only. |
| Slash command | `/memory accept <id>`, `/memory reject <id>` | Resolve pending candidates explicitly. |
| Slash command | `/memory doctor`, `/memory export` | Diagnose or explicitly export sanitized memory. |
| Slash command | `/remember <text>`, `/forget <id\|query>`, `/memory clear` | Explicit add and confirmed destructive deletion controls. |
| Tool | `proposeMemory` | Private candidate-only model tool bound to exact current-user evidence. |
| Tool | `recallMemory` | Private read-only bounded search over active entries. |
| MCP | None | MCP stays orthogonal and cannot bypass memory gates. |

## 6. Files to Create/Modify

| Action | Path (expected) | Notes |
|--------|-----------------|-------|
| Modify first | `.clinerules` (`AGENTS.md` symlink) | Name the dedicated global-state confinement rule before implementing writes. |
| Create | `src/memory/*.js` | Modular implementation described in § 4. |
| Create | `test/memory-*.test.js` | Unit, integration, fault-injection, privacy and concurrency coverage. |
| Modify | `src/agent/agent.js` | Per-turn retrieval/projection and candidate binding. |
| Modify | `src/tools/definitions.js`, `src/tools/handlers/`, `src/tools/index.js` | Private memory tool surface. |
| Modify | `src/commands/index.js`, `src/commands/handlers.js` | Slash-command registration/dispatch. |
| Modify | `src/config.js`, `src/cli.js`, `src/lifecycle/` | Global mode, lazy startup, pause/dry-run and flush integration. |
| Modify/Create | `src/ui/`, `src/ui/index.js` | Memory presentation and confirmations only in the UI layer. |
| Modify | `README.md`, `docs/product.md`, `docs/architecture.md`, `docs/visual-identity.md`, `docs/code-quality-and-security.md`, `docs/glossary.md`, `docs/roadmap.md` | Delivered behavior, threat controls, terms and command reference. |
| Create | `features/global-agent-memory.md` | Delivered feature record from `features/_template.md`; not created during design only. |
| Modify | `features/README.md`, `CHANGELOG.md` | Delivered index and implementation entry. |
| Modify | `spec.md`, `plan.md`, `tasks.md` | Evidence, final paths, status and commit log. |

Exact filenames may be split during implementation only to preserve one responsibility; update this plan before changing the architecture.

## 7. Technical Decisions (summary)

- Memory is native client state, not model weights, session history or MCP state.
- One global store serves all workspaces; project rules remain higher-priority and workspace-scoped.
- `ask` is the default; `auto` needs two-session corroboration.
- Model calls propose candidates only; deterministic code validates and transitions state.
- Snapshot + short WAL + atomic rename is preferred over Markdown-only or a new database dependency.
- `MEMORY.md` is a bounded generated overview, inspired by inspectable client memory but never canonical.
- Retrieval is lexical/diverse/bounded in V1 and dynamic memory stays outside the frozen prompt prefix.
- A dedicated memory path capability is narrower than general home access and is unavailable to model-facing file tools.
- Forgetting removes all content-bearing application copies and every quarantine artifact rather than keeping a recoverable content tombstone.
- grok-build patterns informed locking, recovery and diverse retrieval, but no Rust implementation or dependency is copied.

These decisions are recorded in [ADR-0004](../../docs/adr/0004-global-agent-memory.md).

## 8. Verification Strategy and Gates

| Coverage | Checks | ACs |
|----------|--------|-----|
| Global scope and compatibility | Two temporary workspaces share one injected memory root; neither gains a memory directory; existing config/session/undo/MCP fixtures remain unchanged. | AC-01, AC-02, AC-15 |
| Formation and conflicts | Explicit add, one-session candidate, two-session activation, equivalent deduplication, contradiction, ask/auto transitions and illegal state changes. | AC-03, AC-05 |
| Evidence and privacy | Exact-span validation plus rejection of assistant/tool/file/web/MCP evidence, synthetic tokens/private keys/identifiers, logs and provenance inspection. | AC-04, AC-09 |
| Retrieval and authority | Deterministic ranking fixtures, Portuguese/English paraphrase cases, MMR duplicates, count/token caps, precedence prompt and frozen-prefix snapshot. | AC-06, AC-07 |
| Durability and paths | Inject failures after WAL append/temp write/backup/rename; truncated/checksum-invalid WAL; corrupt snapshot; stale/live/stolen lock; parallel writers; traversal, external symlink and FIFO. | AC-08, AC-12 |
| Deletion/export | Ambiguous/cancelled/confirmed forget, clear, backup/WAL/index purge, quarantine removal, workspace-confined sanitized `0600` export and no session-export coupling. | AC-10, AC-13, AC-14 |
| Modes and lifecycle | Off, pause/resume, dry-run, restart, cancellation during confirmation, shutdown flush timeout and degraded read-only startup. | AC-11, AC-12 |
| TUI | 60/79/80/120 columns, ANSI/control-character injection, Esc/Ctrl+C, nested picker and persistent-prompt ownership. | AC-13, AC-16 |

Mandatory gates after implementation:

1. `node --check` on every touched `src/**/*.js` file.
2. Targeted `node --test test/memory-*.test.js` plus all touched-domain tests.
3. `npm run lint` and `npm test`, reading and triaging full output.
4. `node bin/emile.js --verbose` smoke in an isolated temporary home/workspace using a simple non-mutating task; do not expose real credentials.
5. Manual two-workspace script covering remember, recall, conflict, pause, forget, doctor and corrupt-state recovery; record expected and actual results in `tasks.md`.
6. No `npm audit` is required unless the plan changes to add a dependency; a dependency would require its own justification and ADR review first.

## 9. Git Workflow

| Item | Answer |
|------|--------|
| **Working branch** | `development`; verified before design. Do not switch, create a feature branch or use a worktree unless explicitly requested. |
| **Commit plan** | Commit coherent units directly on `development`: (1) rule/path boundary + storage/tests, (2) formation/retrieval/tests, (3) commands/tools/UI/integration/tests, (4) documentation/registry/closeout. Stage explicit paths only and inspect cached diff before each commit. |

## 10. Failures, Partial State and Rollback

| Topic | Strategy |
|-------|----------|
| Error handling and user-facing messages | Return typed health/mutation results; render bounded messages in `src/ui/`; never throw a memory failure through the agent loop or echo rejected content. |
| Interruption (Ctrl+C / Esc) and readline state | Cancellation before commit makes no change; after durable commit reports completion. Confirmations use the existing exclusive prompt-owner pattern and restore stdin/raw mode in `finally`. |
| Partial storage state | Recover from the latest valid snapshot/backup plus complete WAL events. Quarantine inconsistent artifacts and open read-only if certainty is impossible. |
| Concurrent state | Refresh by revision inside the acquired lock; never write from a stale in-memory snapshot. Release only an exact owned token. |
| Session/history state | Dynamic memory projection is not written into the user's session transcript; only memory record IDs may be diagnostic metadata if needed. |
| Rollback / undo | Code rollback leaves the versioned store untouched. Re-enabling a prior version must either support schema V1 or fail read-only. User data mutations use `/forget`/clear, not workspace `/undo`. |
| Migration | Future schema changes use explicit versioned, idempotent migrations and keep a validated pre-migration backup until successful verification. V1 does not scan or import legacy/provider memory. |

## 11. Technical Risks and Trade-offs

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| False positive becomes global behavior | Medium | Ask default, explicit promotion, two-session threshold, conflict state and higher-priority current/project instructions. |
| False negative from lexical retrieval | Medium | Unicode normalization, bilingual terms/tags, query expansion, evaluation fixtures and explicit `recallMemory`; defer embeddings based on evidence. |
| Non-portable fsync/permission semantics | Medium | Best effort with capability detection and verbose diagnostics; atomic same-filesystem rename and recovery tests on supported platforms. |
| PID reuse incorrectly steals a lock | Low/Medium | Nonce/token ownership, timestamp, bounded stale threshold and conservative process-liveness check where available. |
| Last-known-good backup retains forgotten content | High if missed | Forget/clear rewrite or remove every managed copy under the same lock, followed by content scan tests. |
| Source binding is lost during long tool loops | Medium | Bind the immutable current-user message and proposal window at turn start; reject proposals after unsupported source transitions. |
| Prompt token cost grows | Medium | Hard 1,400-token budget, count caps, diversity and no raw transcript. |
| Memory tool schemas reduce every-call cache efficiency | Low/Medium | Keep schemas small/stable and include them in the frozen tool set; records remain dynamic outside it. |
