# BRIEF P1-17 — System prompt policy: always use the available skills and MCP servers

> Read first: `specs/2026-10-08-deep-dive-backlog/_shared-constraints.md`,
> `docs/deep-dive.md` § 14 (the frozen-prefix anatomy) and § 16 (MCP).
> Requires a small ADR: **ADR-0007** (the frozen-prefix key contract changes —
> see step 4). ADRs currently end at 0006.

## Goal

The system prompt never tells the model that skills and MCP servers exist as
something to USE:

- **Skills**: `buildSystemPrompt` appends the compiled skill bodies via
  `compileSkills(skills)` (`prompt.js:189-193`) but carries NO instruction that
  an active skill's guidance is binding, and when no skill is active the model
  has no idea the mechanism exists.
- **MCP**: the prompt does not mention MCP AT ALL. MCP tools reach the model only
  as function schemas named `<server>__<tool>` (`mcp.js:325-331`,
  `agent.js:280-286`), so the model does not know what they are, that they belong
  to a connected server, or that a specialized server tool should be preferred
  over an ad-hoc shell command that re-implements it.

Add an explicit usage policy, and make the model aware of the CONNECTED servers
without breaking the cache-stable prefix.

## Current behavior (facts, verified 2026-10-10)

- `prompt.js:160-196` assembles: `BASE_INSTRUCTIONS` (constant) → ENVIRONMENT
  CONTEXT → project rules → workspace context → PLANS MODE (conditional) →
  skills block (conditional). **No skills-policy line, no MCP section.**
- `BASE_INSTRUCTIONS` already states a priority order for memory/context
  (`prompt.js:39`: "current user request, then project rules, then confirmed
  global memory, then inference") — the new policy must slot into it, not
  contradict it.
- Frozen prefix key: `agent.js:226` — `spKey = ${plansMode ? 'plans' : 'build'}|${relevantSkills.join(',')}`,
  with the cache rationale documented at `:220-225`. `messages[0].content` is
  rebuilt only when the key changes (`:227-234`).
- `getMcpToolDefinitions()` is called at `agent.js:280` — AFTER the freeze
  (`:226`), so a signature computed from it is not available at freeze time
  without moving the call or adding a cheap accessor.
- `mcp.js:325-331` iterates `activeServers` (a Map) and returns
  `{type:'function', function:{name, …}}` per tool; the name is
  `<server>__<tool>` (explicit map key, no `mcp__` prefix — see § 22 / P2-11).

## Required design (do not re-derive; implement this)

1. **Static policy section in `BASE_INSTRUCTIONS`** (constant text → cache-safe):
   a new `=== SKILLS & EXTERNAL TOOLS (MCP) ===` block with, at minimum:
   - **Active skills are binding task guidance.** A `[SKILL: <name>]` block may
     appear in this prompt; follow it for the current task. Precedence:
     explicit user request > project rules > **active skill guidance** > confirmed
     global memory > inference — and the security gates (safe mode, dry-run,
     path confinement, tool whitelist) always outrank ALL of these. A skill can
     never authorize a command, a write outside the workspace or a credential.
   - **Never invent a skill name or a tool name.** If a capability the task needs
     is missing, say so plainly; the user can add a skill at
     `.agent/skills/<name>/SKILL.md` or connect a server — suggest it, don't
     pretend.
   - **MCP tools exist as `<server>__<tool>`** and belong to a connected server.
     When such a tool matches the task, PREFER it over re-implementing the same
     capability with `runCommand` (`git`/`grep`/`curl` guesses included). If the
     specialized tool fails, report the failure and fall back — never claim
     success for a tool you did not call.
   - **No tool for its own sake**: do not invoke a skill or a server tool without
     a task need; "available" is not "required".
   - **Availability is not the model's decision to reverse on cost grounds**: when
     a task needs information the workspace cannot supply (current docs, a library
     version, anything after the training cutoff) and a web tool IS available, USE
     it — a charge warning in the CLI is a notice to the user, not a reason for the
     agent to decline. **Evidence this is needed (observed 2026-10-10):** with
     Tavily + Firecrawl configured and `searchWeb`/`browsePage` verifiably in the
     request (the user's own "list your tools" run returned 11, including both),
     the agent still answered "there is no websearch function in my schema" and
     fell back to `curl`. The plumbing was verified correct end to end
     (`web/definitions.js:42-49` gate reproduced, `agent.js:378` sends `allTools`
     whole, `ctx.config` is the singleton at `cli.js:513`, `test/agent-web.test.js:60`
     covers it) — so the refusal was model behaviour, and the policy text is the
     lever that fixes it.
2. **Dynamic awareness of CONNECTED servers (cache-honest).** Export a cheap
   `getMcpToolSignature()` from `src/mcp.js` (sorted joiner of the tool names,
   e.g. `server__tool` joined by `,`; `''` when none). When non-empty, the prompt
   gains a short `=== AVAILABLE MCP SERVERS ===` list — one line per server with
   its tool names. It is NOT emitted when no MCP tool is registered.
3. **Skills awareness without a skills block**: the policy text (item 1) is
   ALWAYS present, including when `skills` is empty, so the model knows the
   mechanism exists and can suggest `/skills` or adding a skill.
4. **Extend the frozen key** (`agent.js:226`) to
   `${plansMode ? 'plans' : 'build'}|${relevantSkills.join(',')}|${mcpSignature}`
   so a server added/removed mid-session rebuilds the prefix exactly once (the
   model's capability set changed — that is the honest cache behaviour, matching
   the trade-off comment already at `:220-225`). Compute the signature BEFORE the
   freeze (today `getMcpToolDefinitions()` runs at `:280`; either call the new
   accessor earlier or move the existing call up — do the cheapest correct thing
   and say which in the plan).
   **Write ADR-0007** documenting: the policy section, the availability list, the
   key extension, and the trade-off (a new server invalidates the prefix once;
   without the key change the prompt would silently lie about capabilities).
5. `buildSystemPrompt` gains whatever parameter carries the server list (e.g.
   `{ plansMode, skills, mcpServers }`) and stays a pure function of its inputs —
   no reading of module state inside it beyond what exists today.

## Tests to add

- New `test/prompt-assembly.test.js` (see the regression note in Constraints):
  - the policy section is present with AND without active skills, and its text is
    byte-identical across calls (cache-stable);
  - `=== AVAILABLE MCP SERVERS ===` is ABSENT with no servers, PRESENT with two
    fake servers and lists exactly their tool names;
  - the prompt contains the precedence clause and the explicit "a skill can never
    authorize a command/write/credential" clause (guard against a future edit
    silently dropping the security sentence);
  - with MCP present and a different signature, `spKey` changes and the prompt is
    rebuilt; with an unchanged signature it is NOT rebuilt (assert the cached
    string identity, not just equality).
- `getMcpToolSignature()` unit: empty registry → `''`; two servers → sorted,
  stable across insertion order.
- Prompt assembly has NO dedicated suite today: `buildSystemPrompt` is asserted
  only from `test/rules.test.js` (6 tests, e.g. `=== PROJECT RULES` presence).
  Create `test/prompt-assembly.test.js` for this brief and leave `rules.test.js`
  alone (its assertions must keep passing unchanged).
- Regression: `test/rules.test.js`, `test/skills-load.test.js`,
  `test/skills-cap.test.js`, `test/mcp-tool-visibility.test.js` and the full
  suite stay green. NOTE: any test asserting the old exact prompt text must be
  updated deliberately, never by loosening the assertion.

## Constraints

- The policy must NOT weaken any gate: no wording that lets a skill, a project
  rule or an MCP server override safe mode, dry-run, `resolveSafePath`, the
  command whitelist or the MCP consent/allowlist rules (this is the security AC).
- Keep `BASE_INSTRUCTIONS` free of volatile content (no dates, no counts, no
  environment values) so the prefix stays cacheable.
- No new dependencies; `prompt.js` stays pure w.r.t. its parameters.

## Verification

```
node --check src/prompt.js src/mcp.js src/agent/agent.js
node --test test/prompt-assembly.test.js test/rules.test.js test/skills-load.test.js
npm run lint && npm test
```
Baseline (2026-10-10): 441 tests / 431 pass / 0 fail / 10 env skips; lint exit 0.

## Docs sync (Rule 2)

- **`docs/adr/0007-*.md`** (new — the key contract + the policy).
- `docs/architecture.md`: `prompt.js` row (policy + MCP section + key) and the
  `mcp.js` row (`getMcpToolSignature`).
- `docs/deep-dive.md` § 14 (frozen-prefix anatomy: the new key) + § 16 + § 21.1
  P1-17 row; add the pattern row for "capability policy in the prefix".
- `features/skills-system.md` and `features/mcp-integration.md`: Change History
  rows; `CHANGELOG.md` `[Unreleased]` → Changed.