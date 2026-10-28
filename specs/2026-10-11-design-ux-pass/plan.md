# Plan: Design & UX pass with grok-build as the design base

| Field | Value |
|-------|-------|
| **Spec** | `2026-10-11-design-ux-pass` |
| **Status** | `draft` — Phase 1 (audit) delivered; Stages A–F not started |

---

## 1. Technical Approach

Six stages, one session each, each with its own spec, gates and CHANGELOG entry
(Rule 3/8: a stage is a coherent unit and stops for review). The order is
**dependency-first**, not payoff-first, because every later stage wants to name a
*role* instead of a *hue*:

- **A. Tokens & color semantics** — the role layer over the existing palette
  (no new colors), the gray-by-function rule, the DIM-vs-hardcoded-gray rule.
  Everything else consumes it, so it cannot be reordered without redoing the
  others.
- **B. Transcript vocabulary** — verb-grouped tool rows, the expand affordance,
  the error banner form, session-event prose, hide-don't-fabricate.
- **C. Discoverability** — the hint registry, the `key:label` bar, the
  cheatsheet modal, inline hints.
- **D. States & feedback** — the turn-status line, the calm pulse, empty states,
  cancel/error copy. (Overlaps P2-15: Stage D owns copy and states; P2-15 owns the
  rule engine — noted, not merged.)
- **E. Text rendering** — markdown emphasis rules written down and applied
  (headings, code labels, blockquote/list markers), diff parity with the rest of
  the box vocabulary.
- **F. Known UI Debt** — the five open items of `visual-identity.md` § 5,
  starting with the narrow-width audit that the others keep deferring.

**Blast-radius rule for every stage:** a proposal is implemented only if its
user-visible problem survives a one-line statement ("a 20-read batch prints 20
rows") and its row delta is stated. Nothing is added for symmetry.

## 2. Architectural Compliance

- **ADR-0001:** no dependency, no build step, no TypeScript, no Rust component —
  the reference is a *design* source, cited by `file:line`, never vendored.
- **ADR-0003 (stdout lease):** every stage's rendering goes through existing
  `ui/` modules and the lease; no new writer, no new stdout owner.
- **Robustness invariants that constrain the design** (established by
  `2026-10-10-ui-commit-frontier` / `-frame-transition-flicker`):
  1. **print-once** — a committed block is never repainted, so any
     "expand in place" affordance must APPEND a new block;
  2. **DEC 2026** — a frame transition is one synchronized update, so a hint
     cannot be painted in a second pass;
  3. **frame budget** — the prompt block never exceeds `stdout.rows - 1`, so a
     hint bar that rides the footer competes for that budget;
  4. **one clamp** — every climb goes through `terminal-cursor.js`;
  5. **vertical rhythm** — exactly one blank line between blocks, each block
     owning one *leading* gap (so a new line inside a block is cheap; a new block
     costs a blank line);
  6. **open boxes** — no side rails, no right-padding math.
- **Design system:** `docs/visual-identity.md` is the contract each stage amends;
  the amendments are proposed in the audit and must be approved with it.

## 3. Security and Threat Model

| Element | Handling |
|----------|------------|
| Command execution and whitelist | Not applicable — presentation only. |
| File writes and `resolveSafePath` | Not applicable. |
| LLM inputs (prompt injection / tool args) | All stages keep the existing sanitizers; the audit proposes no new rendering of raw model output. Tool labels/args stay `stripTerminalControls`-sanitized; the error banner keeps `formatApiError`'s redaction as a precondition. |
| Secrets (API keys, sessions, exports) | The hint bar/cheatsheet must never echo a prompt, a command argument or a query (same rule as the window title). Cost/token segments keep the existing `~` estimate honesty. |
| Controls and negative tests | Stage A: role layer must not change a single byte of output (pure rename). Stage B/C: glyph fallbacks for terminals without font coverage; `/export` must stay ANSI-free. Stage D: unknown values omitted, never `0`/`$0.00`. |

## 4. Impacted Modules

| Module | Path | Stage |
|--------|---------|---------|
| Palette + roles | `src/ui/theme.js` | A |
| Tool rows | `src/ui/tool-lines.js` | B |
| Response block | `src/ui/response.js` | B, E |
| Thinking | `src/ui/thinking.js` | B |
| Errors | `src/api/transports/base.js` (formatter), `src/agent/agent.js` (call sites), new `src/ui/error-banner.js` | B |
| Hints | new `src/ui/hints.js` + `src/ui/shortcuts-panel.js` | C |
| Footer | `src/ui/prompt-input-persistent.js` | C, D |
| Turn status | `src/ui/spinner.js`, `src/ui/turn-keys.js`, `src/agent/agent.js` | D |
| Markdown | `src/ui/markdown.js` | E |
| Diff | `src/ui/diff-block.js` | E |
| Panels | `src/ui/{memory,rules,skills}-panel.js`, `src/ui/status-bar.js` | F |

## 5. Impacted Flags / Slash Commands / Tools

| Type | Name | Change |
|------|------|--------|
| CLI flag | — | None |
| Slash command | `/cost` | Stage F only: render in the box vocabulary (item of § 5) |
| Slash command | `/thinking` | Unchanged (stays the toggle); `Ctrl+E` is added as the in-situ expand (Stage B) |
| Slash command | `/keys` (proposed) | Stage C cheatsheet alias *if the user prefers a slash command over `Ctrl+.`* |
| Tool | — | None |
| MCP | — | None |

## 6. Files to Create/Modify

| Action | Path (expected) | Notes |
|------|--------------------|-------------|
| Create | `specs/2026-10-11-design-ux-pass/{spec,plan,tasks}.md` | Phase 1 (this document set). |
| Create | `specs/2026-10-11-design-ux-pass/audit.md` | Phase 1 deliverable. |
| Create (per stage) | `specs/2026-10-1x-<stage>-…/` | Each stage gets its own spec/plan/tasks before code. |
| Modify (Stage A+) | see § 4 | Only after approval. |

## 7. Technical Decisions (summary)

1. **Roles over hues, without touching the palette.** Stage A adds a `ROLE` map
   (aliases into `C`) plus documented functions; the hexes and `C` stay. The gate
   is byte-identical output for unchanged components — a rename, not a restyle.
2. **Three gray functions, not three grays.** Meta punctuation, muted body and
   labels get named functions; where emile already has the right token it is
   aliased, so the change is mostly *rules + consistency*, not new values.
3. **One hint registry.** `HintItem{keys,label,description,pinned}` feeds both the
   bar and the cheatsheet (the reference's actual mechanism), instead of two
   hand-maintained lists that drift.
4. **The expand affordance APPENDS.** The print-once frontier is not negotiated:
   a collapsed block carries its `(ctrl+e to expand)` hint in its own committed
   line, and `Ctrl+E` prints the expanded content as a new block.
5. **The turn-status line replaces the spinner row** rather than adding a row
   (row budget).
6. **Verb-grouping is stateless** because emile already hands `printToolSummary`
   the whole batch — no cross-batch accumulation is needed (unlike the reference,
   which folds runs in a scrollback model).

## 8. Verification Strategy and Gates

Per stage (Rule 6.3), the gates are the same shape as the recent UI work:

- `node --check` on every touched file;
- the four UI suites keep their counts (`prompt-input-render`, `thinking-stream-append`,
  `turn-input-cap`, `thinking-during-active-turn`) plus `turn-keys-visibility`
  and `commit-frontier`;
- `npm test` and `npm run lint` (0 errors);
- a **byte-diff gate for Stage A** (unchanged components must emit identical
  bytes) and a **narrow-width check at 60/79/80/120 columns** for every stage;
- `/export` stays ANSI-free (Stage B/E).

Phase 1's own verification: the AC log in `tasks.md`, plus a manual re-verification
pass over every reference citation (recorded in the audit's Appendix).

## 9. Git Workflow

| Item | Answer |
|------|--------|
| **Working branch** | `development` — no switch, no branch, no worktree (Rule 8). |
| **Commit plan** | Phase 1: one docs commit (`specs/2026-10-11-design-ux-pass/` + the CHANGELOG Docs registration). Stages A–F: one implementation commit each after approval, explicit paths only. |

## 10. Failures, Partial State and Rollback

| Topic | Strategy |
|------|------------|
| Error handling and user-facing messages | A stage that changes copy states the before/after strings in its spec; cancellation and error copy is Stage D's own deliverable. |
| Interruption (Ctrl+C / Esc) and readline state | Any new key (`Ctrl+E`, `Ctrl+.`) is added to the existing keypress handlers, so the lease/raw-mode paths are unchanged; each stage's tests must keep the stdin-ownership suites green. |
| Partial state (session, undo stack, file cache) | None — presentation only. |
| Rollback / undo | Per-stage commits; no persisted format changes. |

## 11. Technical Risks and Trade-offs

| Risk | Likelihood | Mitigation |
|-------|---------------|-------------|
| Stage A's rename touches many files and could change output by accident. | Medium | The byte-diff gate: for components not meant to change, output must be identical before/after. |
| Stage B's rail vocabulary (idea 4) contradicts the documented open-box rule. | Certain if implemented without a decision | Kept as an open question; the amendment to `visual-identity.md` § 3 is part of the Stage B spec, not a silent edit. |
| Discoverability can become noise (a bar that always shouts). | Medium | Pinned-hint budget (≤4 items) and the "no new row" rule; the cheatsheet is opt-in. |
| Stage D's status line adds a permanent row. | Medium | It replaces the spinner row; measured in the stage's tests (row count assertion). |
| The five § 5 debt items are a grab bag. | Medium | Stage F starts with the narrow-width audit because every other item needs it. |