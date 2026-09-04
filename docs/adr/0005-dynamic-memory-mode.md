# ADR-0005: Dynamic memory mode and the `profile` type

| Field | Value |
|-------|-------|
| **Status** | Accepted |
| **Date** | 2026-09-04 |
| **Decision owners** | emile-cli maintainers |
| **Related spec** | [`2026-09-04-dynamic-memory-mode`](../../specs/2026-09-04-dynamic-memory-mode/spec.md) |
| **Supersedes** | Nothing (additive to [ADR-0004](0004-global-agent-memory.md)) |

## Context

The user-global agent memory shipped under ADR-0004 is optimized for **stable work preferences and recurring corrections**. Its source gate (`STABLE_EVIDENCE` regex in `src/memory/formation.js`) accepts only evidence that matches patterns like "I prefer X", "I always/never Y", "minha preferência é Z". The model is prohibited from memorizing personal context that does not match those patterns — even when the user volunteers the fact explicitly.

A real user (this is the maintainer's own usage report, 2026-09-04 16:52, session `session_1788540742711.json`) asked the model to memorize a long personal profile (motivations, personality, recurring projects). The model tried `proposeMemory` 7 times; all 7 were rejected with `unstable-evidence`. The user had no practical path to store the fact through the model, and the `/remember` form was the only alternative — which works but does not match the "agent learns about me" mental model the user expects from a coding agent they spend hours a day in.

The reference product the user maintains elsewhere (Lumine, an unrelated chatbot at `/home/sir/Documentos/GitHub/lumine`) solves this with a four-category `manage_memory` tool (`preference | project | tech_stack | personal`) and a system-prompt instruction that tells the model to call the tool proactively without asking permission. The Lumine model is allowed to save **any** user fact it judges useful, under a chosen category.

Emile's posture is intentionally stricter than Lumine's (privacy gate, secret/identifier denial, two-session corroboration in `auto`, full application-level deletion, exact current-user evidence binding). The decision here is to **add a narrow new path inside those strictures**, not to remove them.

## Decision

Emile extends the user-global memory with a **new memory type — `profile`** — and a **small system-prompt change** that authorizes the model to propose profile records proactively. Every other ADR-0004 invariant is preserved.

1. **`profile` is a type, not a mode.** `MEMORY_TYPES` becomes `[user, workflow, feedback, fact, reference, profile]`. The existing `off | ask | auto` mode trio is unchanged.
2. **The source gate short-circuits `STABLE_EVIDENCE` only for `profile`.** When the proposal `type === 'profile'`, or the proposed key starts with `profile.` / `personal.`, the formation helper returns `null` (pass) without consulting `STABLE_EVIDENCE`. All other source checks (`invalid-source`, `quoted-source`, `task-specific`) still apply.
3. **The privacy gate is dominant.** `assessProposalSource` runs first; `assessMemoryText` (the privacy gate) runs after. A `type: profile` proposal whose evidence is a credential, a private key, a Luhn-valid card number, an SSN/CPF/IBAN-shaped identifier, a security-bypass instruction, or a sensitive personal topic is **still `denied`** or `confirmation-required`. The new paragraph in the system prompt repeats this; the code is the final authority.
4. **Exact current-user evidence is still required.** The model cannot propose a paraphrase, an assistant reply, a tool result, a file read, a web result or MCP content as a `profile` memory. The `evidence` argument must be an exact span of the current user message.
5. **`addExplicitMemory` infers `profile` from the key.** When the user writes `/remember profile.<key>=...` or `/remember personal.<key>=...`, the record is created with `type: 'profile'`. Otherwise the existing `type: 'user'` is kept. No new command.
6. **Retrieval weight for `profile` is 1.18**, between `user` (1.2) and `workflow` (1.15). MMR diversity, the 10 + 6 cap and the 1 400-token budget are unchanged.
7. **State machine is unchanged.** In `ask`, a `profile` candidate is `pending` until `/memory accept`. In `auto`, a `profile` candidate needs a second distinct session. Conflict state still applies when a `profile` evidence disagrees with an existing `user` or `workflow` record on the same key.
8. **The system prompt gains a 4-line paragraph** in the "USER-GLOBAL MEMORY" section telling the model it may call `proposeMemory` proactively for personal context (name, personality, motivations, life situation, recurring rules) **without asking permission first**, with `type: 'profile'` or a `profile.*` / `personal.*` key, while still respecting the privacy gate, the instruction hierarchy and the `ask` / `auto` state machine.
9. **No new tool, no new command, no new module, no new dependency.** The patch is a five-file change in `src/` plus a one-paragraph prompt append plus four new tests.
10. **No schema migration.** The JSON `store.json` keeps `schemaVersion: 1`. The new `type` value is a strict superset of the existing enum and is validated by `MEMORY_TYPES.includes`.

## Consequences

### Positive

- The user can `/remember` or see the model propose `type: profile` for personal context that the previous gate rejected (the session 2711 failure is unblocked).
- Every other ADR-0004 invariant (privacy gate dominance, exact-source binding, two-session `auto`, conflict state, full deletion, restricted permissions, transient projection, prompt caching, instruction hierarchy) is preserved.
- The patch is reversible: a `git revert` of the two commits returns the system to V1 behavior. Records already created with `type: 'profile'` would still pass `validateMemoryState`; if a future rollback wanted to delete them, an explicit migration would be needed and is out of scope.
- The system-prompt paragraph is a single literal string in the cache-stable frozen prefix; the cache key is unchanged.

### Negative

- The model may over-propose `profile` records for one-off statements. Mitigation: the existing `task-specific` source check still rejects task-scoped text; in `ask`, every proposal is `pending` and visible in `/memory list`; in `auto`, a second distinct session is still required. `/memory reject <id>` is one call away.
- The new retrieval weight (1.18) makes `profile` records compete with `user` (1.2) for the 6 `relevant` slots. Mitigation: 1.18 < 1.2 by design, so `user` always wins ties; the cap is global and the diversity selection is MMR-based.
- Lexical retrieval still misses paraphrases across `profile` records (e.g. "Sou movido por insegurança" vs. "busco aprender para compensar insegurança"). Mitigation: deferred to the embedding-based retrieval ADR that ADR-0004 § "Follow-up" already calls for; out of scope for this spec.
- The system-prompt paragraph is in the frozen prefix; if a future model paraphrases the privacy-gate language away, the privacy gate in `assessMemoryText` still runs in code. The prompt is not the authority.

## Alternatives considered

| Alternative | Decision | Reason |
|-------------|----------|--------|
| Adopt Lumine's `manage_memory` tool with 4 categories | Rejected | Emile's tool surface is intentionally more conservative; one strict private tool is better than four overlapping ones. The category semantics is encoded in the `type` field instead. |
| Remove `STABLE_EVIDENCE` entirely | Rejected | That gate is what makes the rest of the formation source checks coherent; removing it weakens the model-derivable formation rules for `user`, `workflow` and `feedback` types that the rest of the spec relies on. The patch instead **bypasses it per record** via the `type` field. |
| Add a new mode `dynamic` and switch to it by default | Rejected | Changes the default behavior for every user, including those who already configured `ask` or `auto`. Per-record via `type` is less surprising. A `dynamic` mode can be added later if data shows it is needed. |
| Embedding-based retrieval in the same patch | Deferred | ADR-0004 § "Follow-up" already calls for a separate evaluation. Adding embeddings here would inflate scope, introduce a dependency and require a separate ADR. |
| Force `auto` for `profile` so the user does not have to accept manually | Rejected | Reduces user control. The user can run two quick turns in `auto` if they want zero-friction; the `ask` default remains the conservative choice. |
| Per-type cap (e.g. 100 profile records) | Deferred | The global cap of 500 active is sufficient for the current scale; a per-type cap adds rules without addressing a real failure mode yet. |

## Follow-up

- Evaluate whether `profile` records over-accumulate. If yes, a per-type cap and an explicit `/memory profile` subcommand can be added in a follow-up spec.
- Re-evaluate lexical retrieval quality across `profile` records. The ADR-0004 embedding decision is the natural next step; this spec does not pre-empt it.
- Track model over-proposal rate. If it is high, a `dynamic` mode (alias of `ask` that lets the model auto-accept `profile` records without user confirmation) can be added with its own ADR.

## References

- [Base spec](../specs/2026-09-03-global-agent-memory/spec.md) and [base plan](../specs/2026-09-03-global-agent-memory/plan.md).
- [ADR-0004](0004-global-agent-memory.md) — the boundary this ADR lives inside.
- [PRD RF-21](../docs/product.md) — the original user story this ADR serves more completely.
- Lumine reference (unrelated project, used for the proactivity idea only): `apps/api/src/lib/prompts.ts:29` and `apps/api/src/routes/chat.ts:279` of the local `/home/sir/Documentos/GitHub/lumine` repository.
