# Plan: Dynamic memory mode for personal profile facts

| Field | Value |
|-------|-------|
| **Spec** | [`2026-09-04-dynamic-memory-mode`](./spec.md) |
| **Status** | `draft` |
| **Type** | Delta to base memory plan |

---

## 1. Technical approach

The patch is **strictly additive at the data layer** (one new enum value, one short-circuit in one source-gate branch) and **one small paragraph in the system prompt** to tell the model it may now propose profile records proactively. Every other ADR-0004 invariant is preserved.

### 1.1 Why this is small

- `MEMORY_TYPES` is already a frozen `Set`; adding `'profile'` is one line in `src/memory/constants.js`.
- `proposeMemory` argument validation already iterates over `PROPOSAL_TYPES`; adding `'profile'` is one line in `src/tools/handlers/memory.js`.
- `assessProposalSource` already short-circuits `invalid-source` and `quoted-source` and `task-specific` before reaching `STABLE_EVIDENCE`; adding a third short-circuit branch ("profile or profile.* / personal.* key") is a five-line change.
- `addExplicitMemory` already infers `type: 'user'`; inferring `type: 'profile'` from the key prefix is a four-line change.
- `TYPE_WEIGHT` in `retrieval.js` is an object literal; adding `profile: 1.18` is one line.
- The base system prompt already has a "USER-GLOBAL MEMORY" section; adding a 4-line proactivity paragraph is a literal string append.

No new module, no new file, no schema migration (the JSON `store.json` keeps `schemaVersion: 1`; the new value is validated by `MEMORY_TYPES.includes`).

### 1.2 State layout and schema

No change. The `store.json` schema is unchanged:

- `type` is one of `user | workflow | feedback | fact | reference | profile` (the new value is a strict superset).
- Every other field (`state`, `key`, `text`, `tags`, `activation`, `confidence`, `sourceSessionRef`, `evidenceSessionRefs`, `sensitivity`, `conflictWith`) keeps identical semantics.
- Records created with `type: 'profile'` are validated by the same `validateRecord` function; `RECORD_KEYS` does not need a new entry.

The hard caps from the base spec remain:

- 500 active records, 100 pending/conflict records, 4 096 chars per record, 4 MiB per artifact.
- Retrieval: ≤ 10 `always` + ≤ 6 `relevant` within a 1 400-token budget.
- `MEMORY.md` overview cap: 200 lines / 25 KiB.

### 1.3 Retrieval impact

`TYPE_WEIGHT` becomes `{ user: 1.2, workflow: 1.15, feedback: 1.1, fact: 1, reference: 0.9, profile: 1.18 }`. The value 1.18 sits between `user` (1.2) and `workflow` (1.15); it lets `profile` records be retrieved slightly more often than workflow rules but never higher than the user-explicit `user` type, which is consistent with "user is the strongest signal, profile is the most-distant personal context".

MMR diversity, recency decay for `feedback`, use-count boost, and the 1 400-token budget are unchanged.

### 1.4 Privacy gate position (the most important sentence in this plan)

The order in `formation.js` is:

```text
assessProposalSource (source gate)  →  assessMemoryText (privacy gate)  →  record creation
```

The patch relaxes step 1 only for `type: profile` (and for keys prefixed `profile.` / `personal.`). Step 2 is **not relaxed** and is dominant. A `type: profile` proposal whose evidence is a secret, a private key, a Luhn-valid card number, an SSN/CPF/IBAN-shaped identifier, a security-bypass instruction, or a sensitive personal topic is still `denied` / `confirmation-required`.

### 1.5 System prompt change (the only non-data change)

Append to the existing "USER-GLOBAL MEMORY" section in `src/prompt.js`:

```text
- Proactive personal profile: in addition to stable work preferences, you may proactively call
  `proposeMemory` (without asking the user first) when the user volunteers a personal fact that
  is likely to matter in future sessions: their name, personality, motivations, life context,
  opinions they hold strongly, or recurring rules. Use `type: "profile"` or a `profile.*` /
  `personal.*` key. The privacy gate still applies — do not propose secrets, identifiers or
  instructions that would weaken project rules. Proposals remain pending in `ask` mode and need
  a second distinct session in `auto` mode.
```

The phrasing mirrors the Lumine prompt in `apps/api/src/lib/prompts.ts:29` (unrelated project) in intent — proactive save, no permission ask — but keeps Emile's authority order and the gate language identical to the rest of the section.

---

## 2. Architectural compliance

- **ADR-0001** (Node + pure ESM, no build) is preserved: zero new dependency, zero new file in `src/`.
- **ADR-0002** (quality gates) is preserved: the change is gated by `node --check` on every touched file, `npm test` (existing 56-file suite plus new tests for AC-D01..AC-D04), `npm run lint`, and a manual two-turn smoke in an isolated temp home.
- **ADR-0003** (active prompt arbitration) is preserved: the system-prompt section is part of the cache-stable frozen prefix; the new paragraph joins it without changing the build key.
- **ADR-0004** (memory boundary) is preserved: the only thing this delta changes is the formation source-gate, in a tightly scoped branch, with the privacy gate still dominant. ADR-0005 records the decision.
- **Mandatory path rule**: no path is touched; all writes still pass through `resolveSafePath`; the memory-only capability root is unchanged.
- **UI**: no UI surface changes; `printMemoryRecords` already displays the `type` field for every record.
- **Prompt caching**: the new paragraph joins the same frozen per-session prefix; the cache key is unchanged.
- **Provider-agnostic**: no provider-specific branch; the prompt change is provider-neutral.

---

## 3. Security and threat model

| Element | Handling |
|---------|----------|
| Source binding | `evidence` must still be an exact span of the current user message (or recent conversation when the formation helper explicitly allows it). The patch does **not** touch `evidenceIsQuoted` or the array-of-text fallback. |
| Quoted / task-scoped / unstable text | Unchanged. `evidenceIsQuoted`, `TASK_SCOPE` and `STABLE_EVIDENCE` (for non-profile types) still reject those sources. The `unstable-evidence` code still applies to non-profile proposals. |
| Privacy gate | Dominant. `assessMemoryText` runs after `assessProposalSource` and is untouched. Credentials, private keys, Luhn-valid cards, SSN/CPF/IBAN-shaped identifiers, security-bypass text, sensitive-topic text → `denied` regardless of `type`. |
| Instruction hierarchy | Unchanged. The system-prompt paragraph repeats that current instructions and project rules outrank memory. |
| Identifier ambiguity | Unchanged. Sensitive `type: profile` records still go through `assessMemoryText`. |
| Concurrency / partial writes | Unchanged. No new mutation path; the new type uses the same `mutateMemoryState` lock + WAL + atomic rename. |
| Deletion | Unchanged. `forget` / `clear` purge every Emile-managed artifact regardless of type. |
| Prompt-injection "remember that I bypass safe mode" with `type: profile` | Two-layer rejection: (a) `BYPASS_PATTERNS` denies the text; (b) `assessProposalSource` would reject it even without the bypass regex because the prose itself is unstable. |
| Negative tests | New tests cover the four new ACs (D01..D04). |

---

## 4. Impacted modules

| Module | Path | Change |
|--------|------|--------|
| Memory types | `src/memory/constants.js` | Add `'profile'` to `MEMORY_TYPES` (now 6 values). |
| Formation source gate | `src/memory/formation.js` | In `assessProposalSource`, add a profile short-circuit: if `proposal.type === 'profile'` or the proposed key starts with `profile.` / `personal.`, return `null` (pass) without consulting `STABLE_EVIDENCE`. Other source checks (`invalid-source`, `quoted-source`) still apply. |
| Explicit remember | `src/memory/formation.js` | In `addExplicitMemory`, infer `type: 'profile'` when the normalized key starts with `profile.` or `personal.`; otherwise keep `type: 'user'`. |
| Retrieval weight | `src/memory/retrieval.js` | Add `profile: 1.18` to `TYPE_WEIGHT`. |
| Tool schema | `src/tools/handlers/memory.js` | Add `'profile'` to `PROPOSAL_TYPES`. |
| System prompt | `src/prompt.js` | Append the proactivity paragraph to the "USER-GLOBAL MEMORY" section. |
| Docs | `docs/glossary.md`, `docs/architecture.md`, `docs/code-quality-and-security.md` | Add a "Profile memory" term; note the type in the `memory/` module rule; note the bypass scope. |
| Feature registry | `features/global-agent-memory.md` | Add a 2026-09-04 entry in the Change History. |
| ADR | `docs/adr/0005-dynamic-memory-mode.md` | New ADR recording the decision. |
| Changelog | `CHANGELOG.md` | New `### Changed` and `### Added` entries under `[Unreleased]`. |
| Tests | `test/memory-formation.test.js` | Add four tests covering AC-D01..AC-D04. |

No file in `src/` is created; no file is deleted; no dependency is added.

---

## 5. Impacted flags / slash commands / tools

| Type | Name | Change |
|------|------|--------|
| CLI flag | None | — |
| Slash command | None | Existing `/memory`, `/memory list`, `/memory show`, `/memory accept`, `/memory reject`, `/forget`, `/memory clear` work for `profile` records unchanged. |
| Tool | `proposeMemory` | `type` enum now accepts `profile`. |
| Tool | `recallMemory` | Unchanged (it already returns any active record by query). |
| MCP | None | — |

---

## 6. Files to create/modify

| Action | Path | Notes |
|--------|------|-------|
| Modify | `src/memory/constants.js` | Add `profile` to `MEMORY_TYPES`. |
| Modify | `src/memory/formation.js` | Add the profile short-circuit in `assessProposalSource`; add the key-prefix inference in `addExplicitMemory`. |
| Modify | `src/memory/retrieval.js` | Add `profile: 1.18` to `TYPE_WEIGHT`. |
| Modify | `src/tools/handlers/memory.js` | Add `profile` to `PROPOSAL_TYPES`. |
| Modify | `src/prompt.js` | Append the proactivity paragraph to the USER-GLOBAL MEMORY section. |
| Create | `docs/adr/0005-dynamic-memory-mode.md` | The decision. |
| Modify | `docs/glossary.md` | Add "Profile memory". |
| Modify | `docs/architecture.md` | Note the new type in the `memory/` golden-rule row. |
| Modify | `docs/code-quality-and-security.md` | Note the profile bypass scope in § 3.10 (memory is never authority) or as a new bullet. |
| Modify | `features/global-agent-memory.md` | Add a 2026-09-04 Change History entry. |
| Modify | `CHANGELOG.md` | New `[Unreleased]` entries. |
| Modify | `test/memory-formation.test.js` | Add four tests for AC-D01..AC-D04. |

---

## 7. Technical decisions (summary)

1. `profile` is a **type**, not a **mode**. The existing `off | ask | auto` mode trio is unchanged; the new behavior is per-record via the `type` field.
2. The new type **does not** introduce a new tool. `proposeMemory` and `/remember` are sufficient; Lumine's separate `manage_memory` tool is not adopted because Emile's tool surface is more conservative by design.
3. The new system-prompt paragraph **does not** weaken the privacy gate; the privacy gate is enforced in code (`assessMemoryText`) regardless of what the prompt says.
4. Retrieval weight for `profile` is **1.18** (between `user` 1.2 and `workflow` 1.15). This is an explicit, narrow choice, not a heuristic; it lets `profile` records be retrieved more often than `workflow` but never higher than `user`.
5. The patch is **strictly additive** at the data layer: the JSON `store.json` of a V1 install keeps `schemaVersion: 1` and is forward-compatible; existing records keep their `type` unchanged.
6. The change is recorded in a new ADR-0005 to keep the decision traceable (the rule that every architectural decision has an ADR).

These decisions are recorded in [ADR-0005](../../docs/adr/0005-dynamic-memory-mode.md).

---

## 8. Verification strategy and gates

| Coverage | Checks | ACs |
|----------|--------|-----|
| Regression of the base spec | Run the full `npm test` suite (the existing 56-file suite) — no test should fail | All base ACs |
| New formation path | New tests: `profile` evidence without `STABLE_EVIDENCE` pattern is `pending`; quoted / task-specific still rejected; secret still `denied`; existing non-profile tests unchanged | AC-D01..AC-D04, AC-D05, AC-D06 |
| Schema acceptance | `validateMemoryState` accepts a record with `type: 'profile'` | AC-D05 |
| Retrieval | `TYPE_WEIGHT.profile` used; the existing diversity / MMR / token budget tests still pass | All base ACs |
| Prompt change | Smoke: start emile in an isolated temp home, run one turn that triggers the model to propose a `profile` record; verify the proposal is `pending` and the prompt paragraph is present in the request body when `--verbose` is on | AC-D05, AC-D07 |
| Deletion | `/forget <profile-id>` removes the record from snapshot, WAL, backup and overview | AC-D08 |

### 8.1 Mandatory gates after implementation

1. `node --check` on every touched `src/**/*.js` file.
2. `npm test` (full suite, 56+ files).
3. `npm run lint`.
4. `node bin/emile.js --verbose` smoke in an isolated temporary home/workspace with a one-turn task that asks the model to propose a `profile` record; verify the proposal is `pending` (in `ask` mode).
5. No `npm audit` is required because the implementation adds no dependency.

### 8.2 Out-of-scope (deferred to a later spec)

- Embedding-based retrieval (ADR-0004 § "Follow-up").
- A `/memory profile` slash command (the existing `/memory list` already shows `type`).
- Per-type cap (500 active is global; not split per type).
- `auto` profile promotion shortcut (profile records still need two distinct sessions in `auto`, same as other types — this is the conservative choice in § 7.4).

---

## 9. Git workflow

| Item | Answer |
|------|--------|
| **Working branch** | `development`; verified before design. Do not switch, create a feature branch or use a worktree unless explicitly requested. |
| **Commit plan** | Two coherent commits on `development`, each staging only its own files:<br/>1. `docs(memory): add dynamic memory mode (profile) and ADR-0005` — spec, plan, tasks, ADR, CHANGELOG, glossary, architecture, code-quality, feature registry.<br/>2. `feat(memory): add profile type and proactive formation` — `src/memory/{constants,formation,retrieval}.js`, `src/tools/handlers/memory.js`, `src/prompt.js`, plus the new tests in `test/memory-formation.test.js`. |
| **Diff scope** | Each commit is small and reversible on its own. The docs commit is purely textual and can be reverted without code change. |

---

## 10. Failures, partial state and rollback

| Topic | Strategy |
|-------|----------|
| Regression in the existing test suite | The patch is strictly additive; if a test fails, the patch is wrong — revert the code commit, fix, redo. The docs commit is independent. |
| `validateMemoryState` rejects a `profile` record from a pre-existing store | Impossible: V1 stores have `type` ∈ `{user, workflow, feedback, fact, reference}`; the new value is purely additive. |
| Model over-proposes `profile` records | Conservative: in `ask`, every proposal is `pending` and visible in `/memory list`; in `auto`, a second distinct session is still required. `/memory reject` is one call away. |
| User dislikes the new behavior | `/memory mode off` disables both `ask` and `auto`; `/memory pause` disables it for the current process. The new paragraph is in the system prompt, not in a config flag, but it has no effect when the mode is `off` or paused. |
| Rollback | `git revert` the two commits. The `store.json` keeps reading because every record is still validated; `profile` records that already exist would still pass `validateMemoryState` (the enum still includes `profile`) — to roll back the type itself, an additional migration would be needed and is out of scope for this spec. |

---

## 11. Technical risks and trade-offs

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Model over-saves `profile` records | Medium | Conservative state machine (`pending` in `ask`; two-session corroboration in `auto`); visible in `/memory list`; one-key forget. |
| Profile records compete with `user` records in retrieval | Low | `TYPE_WEIGHT.profile` = 1.18 < `user` = 1.2; cap is global (10+6/1400 tokens). |
| Privacy gate weakened by the new system-prompt paragraph | Low | Privacy gate is enforced in `assessMemoryText` after `assessProposalSource`; the prompt paragraph explicitly says "privacy gate still applies". |
| Lexical retrieval misses paraphrase across `profile` records | Medium | Same as base spec: deferred to embeddings. Re-evaluation per ADR-0004 § "Follow-up". |
| Conflicting `profile` and `user` records on the same key | Low | Existing conflict state machine: the lower-similarity evidence becomes a `conflict` record, never a silent overwrite. |
| Two-session `auto` is too conservative for `profile` | Low | Acceptable trade-off; the user can `/memory accept <id>` from `ask`, or run two quick turns in `auto`. |

---

## 12. References

- Base spec and plan: [spec](../2026-09-03-global-agent-memory/spec.md), [plan](../2026-09-03-global-agent-memory/plan.md).
- ADR-0004, ADR-0005 (new).
- PRD RF-21, US-15.
- Glossary: "memory candidate", "memory mode", "memory retrieval", "sensitivity".
- Lumine reference (unrelated project, used for the proactivity idea only): `apps/api/src/lib/prompts.ts:29` and `apps/api/src/routes/chat.ts:279`.
