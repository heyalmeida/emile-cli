# Plan: Semantic token roles and the de-emphasis rules (P1-18 Stage A)

| Field | Value |
|-------|-------|
| **Spec** | `2026-10-11-design-token-roles` |
| **Status** | `approved` |

---

## 1. Technical Approach

1. **The role layer is an alias map, nothing else.** `src/ui/theme.js` gains one
   `ROLE` object built entirely from existing `C` functions. No literal, no second
   palette, no new dependency. The map is the vocabulary Stage B–F consume; the
   palette stays the single source (visual-identity principle 1).
2. **Tool tones become meanings.** `formatToolSummary`'s `tone` field is rewritten
   from hue names (`info|warn|red|gold|fg|accent`) to role keys
   (`passive|mutate|danger|search|plain|workflow`), resolved by
   `ROLE.tool[d.tone]`. Verified safe: `tone` has exactly one consumer
   (`tool-lines.js:124`) and no test asserts its strings.
3. **The de-emphasis scale is bound by function.** `meta.punct` (`C.dim`) takes the
   counts and elision markers; `meta.label` (`C.muted`) takes labels, footers and
   separators; `border.box` takes every border (through `boxTopOpen`/`boxBottomOpen`,
   which is where the box consumers already converge).
4. **Two defects fixed (the only byte changes).** `cache hit: N%` moves from the
   success token to `meta.label`; the collapsed thinking line moves from the
   hardcoded `ghost` gray to the DIM attribute on the terminal's own foreground,
   in all three render paths.
5. **No speculative roles.** Roles whose consumer arrives in a later stage (the
   error-banner pair, a `plan` mode accent, `info`) are **not** added; the spec's
   out-of-scope list records why.

## 2. Architectural Compliance

- **ADR-0001:** no dependency, no build step, no TypeScript.
- **ADR-0003 / the robustness invariants:** untouched — no layout, no cursor math,
  no frame budget, no lease, no frontier call changes. The stage only renames
  tokens and fixes two colors.
- **Architecture document:** the `ui/theme.js` row keeps its responsibility
  ("`C` palette, GAP, text utils, measures, box primitives"); the role layer is a
  refinement of the same single source, so no module boundary moves. The row gains
  the role mention.
- **Design system:** `visual-identity.md` § 2 is amended (role table + the three
  rules) and § 6 gains a review line. The **rules** are the deliverable; the
  palette values do not change.

## 3. Security and Threat Model

| Element | Handling |
|----------|------------|
| Command execution and whitelist | Not applicable — no execution path. |
| File writes and `resolveSafePath` | Not applicable. |
| LLM inputs (prompt injection / tool args) | Not applicable to new code: roles format strings that already passed the existing sanitizers; no new input reaches a color decision. |
| Secrets (API keys, sessions, exports) | Not applicable — no new output carries state; `/export` stays ANSI-free (unchanged). |
| Controls and negative tests | AC-01 asserts no color literal enters `ROLE`; AC-03 asserts the collapsed line carries DIM and no ghost triple; AC-02 asserts every tool tone resolves to a role. |

## 4. Impacted Modules

| Module | Path | Change |
|--------|---------|---------|
| Palette + roles | `src/ui/theme.js` | New `ROLE` export; `boxTopOpen`/`boxBottomOpen` use `border.box`; `ghost` comment becomes "reserved". |
| Tool rows | `src/ui/tool-lines.js` | Tone values → role keys; comment describes meaning, not hue. |
| Session bar | `src/ui/status-bar.js` | Separators/id/tokens → `meta.label`; cache segment fixed (success → label). |
| Response | `src/ui/response.js` | `↳ N tools` → `meta.punct`; box label → `agent`; border part → `border.box`. |
| Thinking | `src/ui/thinking.js` | `ghost` → DIM in the three collapsed paths; `✻` header/body → `thinking`. |
| User message | `src/ui/user-message.js` | Message text → `user`; dashes → `meta.label`. |
| Prompt frame | `src/ui/prompt-input-persistent.js` | Elision markers/counters → `meta.punct`; footer/separators → `meta.label`; prompt glyph + selected marker → `border.focused`. |
| Diff | `src/ui/diff-block.js` | `-`/`+`/context → `diff.{delete,insert,context}`; corners → `border.box`. |
| Model picker | `src/ui/model-picker.js` | Focus marker/selected label → `border.focused`; unselected marker → `meta.label`; query value → `body`-equivalent (`user`? no — see § 7); empty message → `warn`. |
| Config panel | `src/ui/config-panel.js` | `on`/`off` states → `success`/`meta.punct`; plans mode → `warn`. |
| Tests | `test/token-roles.test.js` | New: alias identity, tone coverage, the two fixed byte cases. |

## 5. Impacted Flags / Slash Commands / Tools

| Type | Name | Change |
|------|------|--------|
| CLI flag | — | None |
| Slash command | — | None |
| Tool | — | None (tool *labels and tones* are unchanged in value; only the internal tone vocabulary is renamed) |
| MCP | — | None |

## 6. Files to Create/Modify

| Action | Path (expected) | Notes |
|------|--------------------|-------------|
| Create | `specs/2026-10-11-design-token-roles/{spec,plan,tasks}.md` | This document set. |
| Create | `test/token-roles.test.js` | Alias identity + tone coverage + the two corrected byte cases. |
| Modify | `src/ui/theme.js` | `ROLE`; border role; `ghost` doc. |
| Modify | `src/ui/tool-lines.js`, `src/ui/status-bar.js`, `src/ui/response.js`, `src/ui/thinking.js`, `src/ui/user-message.js`, `src/ui/prompt-input-persistent.js`, `src/ui/diff-block.js`, `src/ui/model-picker.js`, `src/ui/config-panel.js` | Role binding (rename) + the two fixes. |
| Modify | `docs/visual-identity.md`, `docs/deep-dive.md` § 19, `features/terminal-ui.md`, `CHANGELOG.md` | Rule 2 sync. |

## 7. Technical Decisions (summary)

1. **Roles are aliases, proven by a test** (`ROLE.meta.label === C.muted`), not by
   inspection — a future retune of `C` flows through automatically.
2. **Role names mirror the reference where a role exists there** (`user`, `agent`,
   `thinking`, `tool`, `success`, `error`, `border`) and use emile's own verbs where
   the reference has no equivalent (`passive/mutate/danger/search/plain/workflow`
   describe *why* a tool row has a color).
3. **No `ROLE.error` yet.** Inside `src/ui/` the only red uses are the diff delete
   rows and `dry-run`; the error-banner pair arrives with its consumer in Stage B
   (audit idea 10), so adding it now would be an unused abstraction.
4. **The tool-arg de-emphasis stays `C.dim`.** The audit § 2 table lists args under
   the middle step, which would be a restyle; Stage A's gate is "a rename, not a
   restyle", so the token is kept and the deviation recorded (§ 11 risks).
5. **`ghost` is kept, not deleted.** It becomes a documented reserved token for
   decorative marks inside an already-visible line; deleting a palette entry is a
   palette decision the audit did not take.
6. **`meta.body` is not created.** After decision 4/5 the third step of the scale
   has no consumer, and the rule ("a hardcoded near-background gray is never text
   the user must read") is what needed writing down.

## 8. Verification Strategy and Gates

| AC | Verification |
|----|--------------|
| AC-01 | `test/token-roles.test.js` — table-driven alias identity for every role member + a scan asserting the `ROLE` block contains no `rgb(`/`bgRgb(`/hex literal. |
| AC-02 | Same suite — one tool per taxonomy branch through `formatToolSummary`; every `tone` is a `ROLE.tool` key and maps to the documented token. |
| AC-03 | Same suite — the three collapsed thinking paths emit the DIM sequence and no ghost triple. |
| AC-04 | Same suite — `printSessionBar` with cached stats: the cache segment equals `ROLE.meta.label('cache: N%')`, and the success token does not appear in the bar. |
| AC-05 | `node --check` on every touched file; the four UI suites + `commit-frontier` + `turn-keys-visibility`; `npm test`; `npm run lint`. |
| AC-06 | Inspection of the four documents. |

## 9. Git Workflow

| Item | Answer |
|------|--------|
| **Working branch** | `development` — no switch, no branch, no worktree (Rule 8). |
| **Commit plan** | One commit: `feat(ui): semantic token roles` (theme + call sites + the new test + docs). Explicit paths only. |

## 10. Failures, Partial State and Rollback

| Topic | Strategy |
|------|------------|
| Error handling and user-facing messages | Unchanged — an unknown tool tone falls back to `ROLE.tool.workflow`, exactly the way the removed hue lookup fell back to the accent token. |
| Interruption (Ctrl+C / Esc) and readline state | Untouched — no keypress path changes. |
| Partial state (session, undo stack, file cache) | None — rendering only. |
| Rollback / undo | Single commit; revert restores the previous tokens. No persisted format changes. |

## 11. Technical Risks and Trade-offs

| Risk | Likelihood | Mitigation |
|-------|---------------|-------------|
| A mechanical rename slips a token (a row changes color unintentionally). | Medium | The alias-identity test plus a targeted review of each diff hunk; the four intended changes are enumerated in the tasks log. |
| The collapsed-thinking change makes reasoning *more* visible than intended. | Low | SGR 2 on the user's own fg is the palette's existing de-emphasis mechanism (it is what `C.dim` already does everywhere else); the alternative (invisible text) is the defect being fixed. |
| Renaming tones breaks a future consumer that arrives before the roles settle. | Low | `tone`'s only consumer is in the same file; the new test pins the vocabulary. |
| Readers expect the audit's § 2 args→muted restyle. | Medium | Recorded explicitly in the spec's out-of-scope list and decision 4; the CHANGELOG entry states that Stage A is a rename plus two fixes. |