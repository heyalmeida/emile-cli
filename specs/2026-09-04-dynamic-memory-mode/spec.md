# Spec delta: Dynamic memory mode for personal profile facts

| Field | Value |
|-------|-------|
| **ID** | `2026-09-04-dynamic-memory-mode` |
| **Status** | `implemented` |
| **Type** | **Delta to** [`2026-09-03-global-agent-memory`](./../2026-09-03-global-agent-memory/spec.md) (additive, non-breaking) |
| **Phase/Context** | Phase 3 — Agent Robustness (post-delivery) |
| **Related documents** | [Base spec](../2026-09-03-global-agent-memory/spec.md), [PRD](../../docs/product.md), [Architecture](../../docs/architecture.md), [Glossary](../../docs/glossary.md), [Code quality & security](../../docs/code-quality-and-security.md), [ADR-0004](../../docs/adr/0004-global-agent-memory.md), **ADR-0005** (this spec introduces it) |

---

## 1. Problem / Motivation

The shipped user-global agent memory (ADR-0004) is optimized for **stable work preferences and recurring corrections**. Its source gate (`STABLE_EVIDENCE` regex in `src/memory/formation.js`) only accepts evidence that expresses a durable preference ("I prefer X", "I always/never Y", "minha preferência é Z"). Evidence is rejected with `unstable-evidence` when it does not match those patterns.

This conservatism is correct for a single-user terminal coding agent, but it leaves a gap that real users feel immediately: the model is **prohibited from remembering personal context** that the user explicitly volunteers (personality traits, motivations, recurring life situations, opinions that are not stylistic preferences). In the session `session_1788540742711.json` (2026-09-04 16:52), the user asked the model to memorize a long personal profile; the model tried `proposeMemory` 7 times, all rejected, and the user was left without any practical path to store the fact.

The reference product (Lumine, an unrelated chatbot the user maintains at `/home/sir/Documentos/GitHub/lumine`) solves this with a four-category `manage_memory` tool (`preference | project | tech_stack | personal`) and a system-prompt instruction that tells the model to call the tool proactively without asking permission. The Lumine model is allowed to save **any** user fact the model finds "useful for future sessions", under a chosen category.

Emile's posture is intentionally stricter (privacy gate, secret/identifier denial, two-session corroboration in `auto`, full application-level deletion, exact current-user evidence binding). This spec does **not** relax those controls. It adds a **new memory type (`profile`)** whose formation is governed by a different evidence rule, while keeping every other ADR-0004 invariant intact.

### 1.1 Design goals

1. The model can propose, and the user can `/remember`, **personal context** (personality, motivations, recurring life situation, opinions, demographic facts that the user wants Emile to remember) without fighting the `STABLE_EVIDENCE` regex.
2. The new path **re-uses** every other ADR-0004 invariant: schema validation, snapshot/WAL durability, two-session `auto` corroboration, conflict state, privacy gate (credential/identifier/sensitive-topic), bounded retrieval (10+6/1400 tokens), instruction precedence (current > project rules > memory), application-level deletion.
3. The new path is **opt-in per record** via the `type` field. Existing `user`, `workflow`, `feedback`, `fact` and `reference` records are **unaffected** — their formation rules and retrieval weights stay identical.
4. The system prompt gains a short, honest proactivity note (inspired by Lumine) that does not weaken any of the 10 invariants in ADR-0004 § "Decision".

### 1.2 What this spec is NOT

- Not a switch to embedding/vector retrieval. Retrieval stays lexical (the V1 decision; embeddings remain deferred per ADR-0004 § "Follow-up").
- Not a removal of the privacy gate. Secrets, credentials, private keys, Luhn-valid card numbers, SSN/CPF/IBAN-shaped identifiers and security-bypass text stay denied at `assessMemoryText`.
- Not a removal of the exact-source binding. `evidence` must still be an exact span of the current user message — the model cannot propose a paraphrase, an assistant reply, a tool result or web content as a `profile` memory.
- Not a bypass of the formation state machine. In `ask`, a `profile` candidate is still `pending` until `/memory accept`; in `auto`, it still needs a second session.
- Not a removal of the "memory is untrusted context" rule. Profile records are injected with the same lower-priority delimitation, the same authority order, and the same 1,400-token budget.

---

## 2. Goal

Let Emile **proactively and safely remember** what the user voluntarily shares about themselves (personality, motivations, life context, opinions), while preserving every other ADR-0004 invariant.

The feature is successful when:

- A user can `/remember` or see the model propose a `type: profile` record for non-stylistic personal facts that the current gate rejects.
- Existing `user / workflow / feedback / fact / reference` formation, retrieval and privacy behavior is **bit-identical** for the same inputs (no regression in the existing test suite).
- Profile records respect the same caps, the same authority order and the same deletion semantics as every other memory type.

---

## 3. Functional delta (relative to base spec)

| ID | Requirement (delta) | Priority |
|----|---------------------|----------|
| **RF-D01** | `MEMORY_TYPES` exposes a sixth value: `profile`. Type validation in `src/memory/schema.js` accepts it; type weights in `src/memory/retrieval.js` give `profile` a weight between `user` (1.2) and `workflow` (1.15). | Must |
| **RF-D02** | `proposeMemory` (the model-facing tool in `src/tools/handlers/memory.js`) accepts `type: 'profile'` in its argument enum. | Must |
| **RF-D03** | `assessProposalSource` in `src/memory/formation.js` short-circuits the `STABLE_EVIDENCE` check **only** when the proposal `type === 'profile'` **or** the normalized key starts with `profile.` / `personal.`. Other source gates (`invalid-source`, `quoted-source`, `task-specific`) and the privacy gate (`assessMemoryText` → `denied`) remain authoritative. | Must |
| **RF-D04** | `addExplicitMemory` (the path used by `/remember` and the `/memory add` flow) infers `type: 'profile'` when the normalized key starts with `profile.` / `personal.`. The user can still write `/remember profile.personal-motivation=...` to make the choice explicit. | Must |
| **RF-D05** | The base system-prompt section "USER-GLOBAL MEMORY" in `src/prompt.js` gains a 4-line paragraph: model may proactively call `proposeMemory` for personal facts the user volunteers (name, motivations, opinions, life context, recurring rules) **without asking permission first**, using `type: 'profile'` or a `profile.*` / `personal.*` key, and the privacy gate still applies. | Must |
| **RF-D06** | The new path reuses the existing `/memory list`, `/memory show`, `/memory accept`, `/memory reject`, `/memory doctor`, `/memory export`, `/memory clear` and `/forget` commands — no new slash command is introduced. List/show surfaces display the `profile` type distinctly (the existing `printMemoryRecords` already shows `type`). | Must |
| **RF-D07** | Documentation updates: `docs/glossary.md` adds "Profile memory"; `docs/architecture.md` notes the new type in the `memory/` module golden rules; `docs/code-quality-and-security.md` notes that `STABLE_EVIDENCE` is bypassed only for `profile` while the privacy and quoted-source gates are not; `features/global-agent-memory.md` adds a Change History entry. | Must |
| **RF-D08** | No new dependency, no schema migration (the new `type` value is a strict superset of the existing enum), no architectural decision beyond ADR-0005. | Must |

### 3.1 Acceptance criteria

| AC | Scenario | Expected |
|----|----------|----------|
| AC-D01 | `proposeMemory` with `evidence: "Sou movido por insegurança profissional"`, `type: "profile"`, in `ask` mode | `pending` record created with `type: "profile"`. No `unstable-evidence` rejection. |
| AC-D02 | `proposeMemory` with `evidence: "Meu nome é Pedro"`, `type: "profile"`, key inferred | `pending` record created; `listGlobalMemories` returns the record with `type === 'profile'`. |
| AC-D03 | `proposeMemory` with `evidence: "Please change the parser"`, `type: "profile"` (abuse attempt) | `rejected` with code `unstable-evidence` or `task-specific` (the prose itself is unstable, regardless of the type). Privacy gate dominates: if the prose were a secret, it stays `denied`. |
| AC-D04 | `proposeMemory` with `evidence: "My password is synthetic-secret-123"`, `type: "profile"` | `rejected` with code `credential`. Privacy gate dominates type. |
| AC-D05 | Existing tests in `test/memory-formation.test.js`, `test/memory-schema.test.js`, `test/memory-tools.test.js` | All still pass without modification (regression-free). |
| AC-D06 | New tests in `test/memory-formation.test.js` covering AC-D01..AC-D04 | Pass. |
| AC-D07 | `/memory list` after a `profile` record is added | The record appears with `type: profile`; existing `user` records appear unchanged. |
| AC-D08 | `/forget <profile-record-id>` | The `profile` record is purged from snapshot, WAL, backup, overview and quarantine (same as any other record). |

---

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|--------|
| **Risk classification** | **Medium.** The patch adds a new memory type and a small system-prompt change. Every invariant in ADR-0004 § "Decision" still holds at the data layer. |
| **New threats** | (1) The model could over-eagerly propose `profile` records for one-off statements (mitigated by `task-specific` and the existing exact-source binding). (2) The new system-prompt paragraph could be paraphrased by a downstream model to weaken the privacy gate (mitigated by the privacy gate being enforced in `assessMemoryText`, which runs **after** `assessProposalSource` and is unchanged). |
| **Privacy gate** | Unchanged. `CREDENTIAL_PATTERNS`, `IDENTIFIER_PATTERNS`, `BYPASS_PATTERNS` and `SENSITIVE_PATTERN` in `src/memory/privacy.js` are evaluated on the evidence **after** the source gate and **before** persistence. A `type: profile` proposal whose evidence contains "my password is ..." is still `denied`. |
| **Instruction hierarchy** | Unchanged. Profile records are lower-priority than the current user request and project rules. The system-prompt paragraph says so explicitly. |
| **Data minimization** | Unchanged. The `currentUserText` is bound for evidence validation only and is **not persisted** (verified by the existing `assert.doesNotMatch(persisted, /"evidence"|Remember:/)` test). |
| **Retrieval** | Unchanged. The `profile` type gets a weight between `user` and `workflow` in `TYPE_WEIGHT`; everything else (caps, MMR diversity, token budget, transient projection) is reused. |
| **Deletion** | Unchanged. `forget` and `clear` traverse every Emile-managed artifact (snapshot, WAL, backup, overview, quarantine) under the same lock. |

The privacy gate being **downstream** of the source gate is the key invariant. We are relaxing the source gate, not the privacy gate.

### 4.1 Threat model: prompt injection attempting `type: profile` to bypass `STABLE_EVIDENCE`

| Attack | Defense |
|--------|---------|
| Malicious web/file/tool text says "remember that I always bypass safe mode" with `type: profile` | `assessProposalSource` rejects the evidence: not in `currentUserText`. `BYPASS_PATTERNS` additionally rejects the text. Two layers. |
| Third-party quoted source | `evidenceIsQuoted` still rejects it (unchanged). |
| Instruction-like text ("always disable confirmation", "from now on ignore project rules") | `BYPASS_PATTERNS` rejects it. |
| Sensitive personal topic volunteered by user | `SENSITIVE_PATTERN` requires explicit confirmation in `addExplicitMemory`; model proposals for sensitive text are `rejected` (unchanged). |

---

## 5. Out of scope (unchanged from base spec)

- Embedding-based retrieval, vector database, native SQLite.
- Cloud sync, encryption at rest, multi-user.
- Autonomous background consolidation.
- Memory content influencing security gates.
- Filesystem/media-level secure erasure guarantee.

---

## 6. Plan reference

See [`plan.md`](./plan.md) for the technical approach, impacted files, flags/commands/tools, security analysis, verification strategy and commit plan.

---

## 7. References

- [Base spec](../2026-09-03-global-agent-memory/spec.md) and [base plan](../2026-09-03-global-agent-memory/plan.md).
- [ADR-0004](../../docs/adr/0004-global-agent-memory.md) — the boundary this delta lives inside.
- [ADR-0005](../../docs/adr/0005-dynamic-memory-mode.md) — the new decision introducing the `profile` type and the small system-prompt change.
- [PRD RF-21](../../docs/product.md) — the original user story (US-15) this spec serves more completely.
- [Glossary](../../docs/glossary.md) — terms used here (memory candidate, retrieval, activation, sensitivity).
