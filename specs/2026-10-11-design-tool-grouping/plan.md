# Plan: Verb-grouped tool rows (P1-18 Stage B-1)

| Field | Value |
|-------|-------|
| **Spec** | `2026-10-11-design-tool-grouping` |
| **Status** | `approved` |

---

## 1. Technical Approach

1. **A pure planner, then a renderer.** `groupRows(details)` splits the batch into
   `{ group: true, details }` / `{ detail }` rows in original order; `printToolSummary`
   renders each row through the existing prefix/width helpers. Keeping the plan
   pure means the rule is tested without stdout, and the renderer keeps its
   current byte output for everything that is not a batch.
2. **The batch key is the operation, not the tool name.** Two adjacent details
   group only when `tone` (the role), `label` (which carries the MCP server) and
   `mcp` are equal — so an edit between two read runs splits them, and two MCP
   servers never merge.
3. **Groupable roles are the informational ones** (`passive`, `plain`, `search`):
   looking at places. `mutate`/`danger`/`workflow` stay per-row because their
   argument is the information (reference: `ToolCallBlock::verb_group_kind`
   excludes commands and edits, `tool/mod.rs:94-104`).
4. **The count is about calls, not about distinct paths**, so the row cannot
   over- or under-state the hidden work when the same file is read twice.
5. **Truncation drops arguments, never the marker**: the `+N more` marker is the
   part that tells the user something is hidden, so the loop shrinks the shown
   list until the row fits, ending at the marker alone.

## 2. Architectural Compliance

- **ADR-0001:** no dependency, no build step.
- **ADR-0003 + the robustness invariants:** untouched — the group is committed
  through the same frontier call, in the same single write, with the same leading
  `GAP.section`; no cursor math, budget or lease change.
- **Design system:** the grid vocabulary is preserved (bullet, 8-column label
  column, role tone, dim args); `visual-identity.md` § 3 gains the grouping rule.
- **Role layer:** the grouping reads `ROLE.tool` keys, never hues (Stage A).

## 3. Security and Threat Model

| Element | Handling |
|----------|------------|
| Command execution and whitelist | Not applicable. |
| File writes and `resolveSafePath` | Not applicable. |
| LLM inputs (prompt injection / tool args) | Each argument is `stripTerminalControls`-sanitized before rendering; the grouping merges already-sanitized strings and takes the **first line only**, so a crafted argument cannot inject an escape, a newline or a second row. |
| Secrets (API keys, sessions, exports) | Unchanged — the paths/queries rendered are the same ones the per-row renderer already printed. |
| Controls and negative tests | Width bound asserted at 60 columns; the marker preserved under truncation; `+N more` derived only from the run length. |

## 4. Impacted Modules

| Module | Path | Change |
|--------|---------|---------|
| Tool rows | `src/ui/tool-lines.js` | `groupRows` (pure) + the grouped-row renderer; `printToolSummary` iterates rows. |
| Tests | `test/mcp-tool-visibility.test.js` | 7 new cases: the 20-read batch, threshold behaviour, interruption/side-effects, repeated args, narrow width, MCP servers, and the pure plan + turn counter. |

## 5. Impacted Flags / Slash Commands / Tools

| Type | Name | Change |
|------|------|--------|
| CLI flag | — | None |
| Slash command | — | None |
| Tool | — | None (the *rendering* of tool batches changes; no tool's behavior or output changes) |
| MCP | — | None |

## 6. Files to Create/Modify

| Action | Path (expected) | Notes |
|------|--------------------|-------------|
| Create | `specs/2026-10-11-design-tool-grouping/{spec,plan,tasks}.md` | This document set. |
| Modify | `src/ui/tool-lines.js` | Grouping. |
| Modify | `test/mcp-tool-visibility.test.js` | Grouping cases (5 → 12). |
| Modify | `docs/visual-identity.md`, `features/terminal-ui.md`, `CHANGELOG.md`, `docs/deep-dive.md` | Rule 2 sync. |

## 7. Technical Decisions (summary)

1. **Threshold 3**, from the audit's stated default (open question Q6); it is a
   named constant (`GROUP_MIN`), so the taste call is a one-line change.
2. **Show up to 3 distinct arguments** then `+N more` (the audit's § 8 sketch),
   not the reference's `Read 20 files` phrasing: emile's grid lists the *places*,
   which is the information a `read`/`grep` row carries. The reference phrasing is
   recorded in the spec's out-of-scope list as an alternative.
3. **No running-vs-done tense.** emile prints a batch once, after execution
   (`agent.js` calls `printToolSummary` per batch), so there is no streaming state
   to reflect — the reference needs the tense because its rows fold inside a live
   scrollback.
4. **`↳ N tools` stays.** The batch shape and the turn total are different facts;
   the counter keeps counting calls.

## 8. Verification Strategy and Gates

| AC | Verification |
|----|--------------|
| AC-01, AC-02, AC-03, AC-04, AC-06 | `test/mcp-tool-visibility.test.js` — the batch, threshold, interruption/side-effect, repeated-argument and MCP-server cases. |
| AC-05 | Same suite at `columns: 60` with long paths: every line ≤ 60 and the marker present. |
| AC-07 | `node --check src/ui/tool-lines.js`; the full suite; `npm run lint`. |
| AC-08 | Inspection of the four documents. |

## 9. Git Workflow

| Item | Answer |
|------|--------|
| **Working branch** | `development` — no switch, no branch, no worktree (Rule 8). |
| **Commit plan** | One commit: `feat(ui): verb-group adjacent tool rows`. |

## 10. Failures, Partial State and Rollback

| Topic | Strategy |
|----------|------------|
| Error handling and user-facing messages | Unchanged — an unknown tone still falls back to the workflow role, and non-batch rows render as before. |
| Interruption (Ctrl+C / Esc) and readline state | Untouched — no keypress or stdin path changes. |
| Partial state (session, undo stack, file cache) | None — the batch is in memory for the length of one render. |
| Rollback / undo | One commit; reverting restores per-row rendering. |

## 11. Technical Risks and Trade-offs

| Risk | Likelihood | Mitigation |
|-------|---------------|-------------|
| A batch hides a path the user wanted to see. | Medium | Up to 3 paths are named, the hidden count is explicit, the tone+label say what happened, and `↳ N tools` keeps the total. Short runs (1–2) are untouched. |
| The width loop could drop every argument and leave a bare marker. | Low | That is the designed floor and still honest; the badge-only form only appears on a very narrow terminal with very long paths. |
| Column math regression for MCP rows. | Low | The prefix builder is shared with the single-row path, and the existing MCP/alignment tests still pass. |