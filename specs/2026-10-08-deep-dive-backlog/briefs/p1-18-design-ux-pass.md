# BRIEF P1-18 — Design & UX pass grounded in grok-build

> Read first: `specs/2026-10-08-deep-dive-backlog/_shared-constraints.md`,
> **`docs/visual-identity.md` (the source of truth for emile's terminal UI — every
> change starts and ends there)**, `docs/deep-dive.md` § 19, § 22.
> Reference implementation: `C:\Users\mc33p\Documents\GitHub\grok-build` (Rust).

> **This is a DESIGN brief, not a bug-fix brief.** The user asked for a better
> design and UX, not corrections. **Phase 1 produces a written audit + proposal
> and STOPS for the user's approval** — taste is not delegated. Only after
> approval do the implementation phases run (each as its own session).

## Goal

Raise emile's terminal design and UX toward the reference's *design decisions* —
information hierarchy, block vocabulary, discoverability, feedback and text
rendering — while keeping emile's identity (Tokyo Night palette, open boxes,
1-blank-line vertical rhythm unit) and its text-only, no-build-step constraints.

## Why the reference is the right base

grok-build ships a design system, not a style: a named semantic token layer with a
"no hardcoded colors elsewhere" rule, a transcript block vocabulary with a shared
visual grammar, a registry-driven hint bar plus cheatsheet, calm animation tiers,
and — most valuable — a documented set of things it deliberately AVOIDS. § 22 of
the deep-dive already recorded the rendering mechanics; this brief ports the
DESIGN layer.

## Design inputs (verified by a dedicated audit; RE-VERIFY each citation before using it)

The audit's findings, condensed. Each carries its reference evidence — treat a
citation you cannot confirm as a claim to drop, not to write around.

1. **Named semantic token layer, single source.** "All colors come from the
   `Theme` struct. No hardcoded colors elsewhere" (`xai-grok-pager-render/src/theme/mod.rs:1`,
   `theme/tokyonight.rs:1`). Roles, not hues: `accent_user/assistant/thinking/tool/
   system/error/success/running/skill/plan/verify/memory/model`, `text_primary/secondary`,
   three grays, `command`/`path`/`running`, four border roles, diff tokens,
   `md_heading_h1..h6` (+ per-level `_mod`). **Corrected 2026-10-11** (the audit
   verified the tree): there is no `accent_memory` — the memory-adjacent roles are
   `accent_remember` and `accent_model`; and the markdown tokens are
   `md_heading_h*`, not `md_h*`.
2. **A three-step gray hierarchy tied to function** (`theme/tokyonight.rs:70-74`):
   `gray_dim` = meta punctuation (`$`, `(+N/-M)`), `gray` = muted body/collapsed
   content, `gray_bright` = labels/tool accents. One "dim" is never enough.
3. **Never bright-black for body/secondary text** — de-emphasize with SGR DIM on
   the default foreground, because unknown profiles tune ANSI-8 near the
   background (`theme/terminal_default.rs:12-18`, enforced by a test).
4. **Transcript blocks are NEVER boxed**: a 1-column accent rail + a leading bullet
   + an optional background band carry the structure
   (`scrollback/layout.rs:15-43`, `block.rs:40-197`). Borders are reserved for the
   composer, the selection box and modals.
5. **Asymmetric user/agent treatment**: the user turn gets an elevated band + a
   `❯` pointer, the agent's prose is plain markdown with NO accent and no bullet
   (`blocks/user.rs:188-227, 263-271`; `blocks/agent.rs:180` returns `None`).
   Rationale: user turns are the scan anchors; the agent reads like a document.
6. **Discoverability is registry-driven**: one `HintItem` shape
   (`{keys, label, longDescription, pinned}`) feeds a dynamic `key:label` footer
   bar (`views/shortcuts_bar.rs:1-34`) and a grouped cheatsheet modal
   (`views/shortcuts_help.rs:1-15`); pinned hints survive narrow widths; an armed
   action echoes `press again to {label}`.
7. **In-situ expand affordances**: a collapsed foldable row swaps its bullet for
   `›` (`xai-grok-pager-render/src/appearance/config.rs:114-123` — corrected path;
   the file is under `xai-grok-pager-render/`, not `xai-grok-pager/`) and appends a dim `(ctrl+e to expand)`
   **without adding a row** (`blocks/thinking.rs:16-44`).
8. **Verb-grouping for consecutive tool calls** (`tool/mod.rs:71-145`): adjacent
   similar rows collapse into one summary line — `Read 3 files`, `Searched 4
   patterns` — present tense while running, past when done; overflow as a synthetic
   **"N more" group-header row** (`scrollback/render.rs:444`, label from
   `truncation_header_label`) — **corrected 2026-10-11**: the `╶╶ N more` glyph does
   not exist anywhere in the tree. The audit's proposal goes one row further than
   the reference: fold the count into the group row (`+N more`) instead of emitting
   a second row.
9. **One rich turn-status line that degrades by width** (`views/turn_status.rs:1-37`):
   `⠧ Run command 0.2s    1m20s ⇣12k [stop]` — spinner + role-colored activity
   label + optional phase timer (dropped below ~60 cols), right-aligned turn timer
   + compact tokens + `[stop]`; idle background work pulses at HALF the active
   spinner speed so it reads calmer.
10. **Non-fabricating, typed feedback**: errors become a `headline: detail` banner
    with a typed error kind, never a raw JSON dump (`app/error_display.rs:1-3`);
    completion is `Worked for 2.3s`; unknown values are OMITTED rather than shown as
    `0`/`$0.00`; cost hidden below $0.005 (`docs/user-guide/25-status-line.md:22,112`).
    **Corrected 2026-10-11**: a successful compaction is NOT invisible — it renders
    as `Context compacted: A → B tokens` (`blocks/session_event.rs:435-439`, tests at
    `:1045, :1056`). The rule that DOES hold is one line per outcome, never a
    duplicate (`session_notification.rs:1660`).

Reference anti-patterns to adopt as rules (verbatim rationale worth keeping):
terse periodless status copy (`session_event.rs:375`); no animation that could read
as broken (`notifications/title.rs:18`, `turn_status.rs:29-31`); never recolor block
borders on selection (`xai-grok-pager-render/src/appearance/config.rs:113`); legacy-glyph ASCII fallbacks for
providers without font fallback (`glyphs.rs:1-7`).

## Emile's current design state (facts to work FROM, not against)

- `docs/visual-identity.md` is the design contract: 6 principles, the Tokyo Night
  `C` palette with semantic roles, ~20 components, spacing constants
  (`GAP.none|section|command`), `MAX_BOX_W = 120`, open boxes (top+bottom borders
  only, no side rails — a deliberate fix for right-padding math), a mandatory
  1-blank-line vertical rhythm, an interaction table, a **Known UI Debt** section
  (5 open items) and a **Visual Review Checklist** (the acceptance gate).
- Already close to the reference, do not redo: single palette source (`C`),
  semantic tool colors, user message as a full-width divider (emile's answer to
  #5), the thinking block's expanded/collapsed states, the windowed prompt with
  elision markers (the new `⌃ N earlier rows` / `⌄ N later rows` vocabulary),
  DEC 2026 atomic frame transitions, the commit frontier (print-once).
- Gaps the reference exposes (candidates for the proposal): no `running`/`skill`/
  `plan`/`verify`/`selection` tokens; only two mute levels; no verb-grouping for
  consecutive tool calls; no hint bar / cheatsheet beyond the model+tokens+cost
  footer; no expand affordance vocabulary; no structured error banner (errors are a
  flat red line); no turn-status line (the spinner is generic — item #1 of
  visual-identity's own debt); `Tool lines` are one row per call; markdown emphasis
  rules are not written down; `Shift+Enter`, `Esc`, `/command` discoverability is
  README-only.
- Known UI debt already documented in `visual-identity.md` § 5 (fold into the
  proposal, do not ignore): generic spinner for long chained tools; flat API-error
  treatment; selects without radio-style active/inactive; `/cost` outside the box
  pattern; no narrow-width audit of every component.

## Phase 1 — the audit + proposal (mandatory, no code)

Create `specs/2026-10-11-design-ux-pass/` with `spec.md`, `plan.md`, `tasks.md`
and **`audit.md`** containing, per design input above (1–10 + the anti-pattern
rules):

- **Reference** — the decision, its evidence (file:line, re-verified by you), and a
  one-line statement of the design principle behind it.
- **Emile today** — what emile does now, with `file:line` (UI modules, and the
  matching row in `docs/visual-identity.md`).
- **Proposal** — the concrete change, described as the user would SEE it (before →
  after, ideally with a small ASCII sketch), plus what it costs (rows/columns,
  new keys, new tokens) and what it touches.
- **Verdict** — adopt / adapt / skip, with the reason. A `skip` must say why emile's
  current answer is better or the reference does not apply.

`audit.md` ends with a **prioritized proposal list** (P0→P3) and the open
questions for the user. **Stop here and hand it to the user.** No UI code lands in
Phase 1.

## Phases 2+ — implementation (only after approval; one stage per session)

Suggested staging (the approved audit may reorder it):

- **Stage A — tokens & color semantics.** Extend `src/ui/theme.js`/`index.js` with
  the missing roles (running, skill, plan/verify, selection, borders, diff
  insert/delete, a third gray) and adopt the no-hardcoded-colors-outside-the-theme
  rule as an explicit contract (lint-adjacent: an ESLint `no-restricted-syntax`
  guard is acceptable — the repo already enforces palette rules that way). Document
  every token in `visual-identity.md` § 2 with its semantic use.
- **Stage B — transcript vocabulary.** Verb-grouping for consecutive tool calls;
  the `›` expand indicator + row-free inline hint for foldable blocks; the
  structured error banner (`headline: detail`, typed kind); session-event prose
  (`Worked for Ns`, `Turn cancelled by user`, `Context compacted → N tokens`);
  hide-not-fabricate for unknown values. Each block's rows must stay inside the
  vertical-rhythm and width rules.
- **Stage C — discoverability.** A `key:label` hint bar (dynamic per context,
  pinned items surviving narrow widths) + a grouped cheatsheet on a free key
  (`Ctrl+.`/`Ctrl+X` are free in emile; `Ctrl+E/F/G/H` are free too — reserved keys
  today: `C`, `P`, `T`, `U` in the prompt) + the inline expand hints from Stage B.
- **Stage D — states & feedback.** The turn-status line (activity + phase timer +
  turn timer + tokens + `[stop]`), degrading by width; calm pulse for background
  work; empty states; error/cancel copy. NOTE the dependency: the permission card's
  scope options overlap **P2-15** (permission rules) — do not duplicate its design.
- **Stage E — text rendering.** Write down the markdown emphasis rules
  (what is bold/dim/italic and why), code-block language label + background,
  table rendering if emile gains tables, diff parity (context lines, dual line
  numbers, diffstat in the collapsed header).
- **Stage F — the five Known-UI-Debt items** in `visual-identity.md` § 5.

## Evidence rules for ANY UI change here (design can't be CI-asserted)

1. `docs/visual-identity.md` is updated in the SAME commit (palette rows, component
   rows, interaction rows, debt list).
2. A **manual review script** in `tasks.md`: the exact steps + what to look at, run
   at **60 / 80 / 120+** columns, with `NO_COLOR=1`, on a legacy-glyph terminal if
   available, and with a long transcript scrolled. Record observed vs expected.
3. A **before/after screenshot or recorded capture attached to the spec** (the
   checklist at `visual-identity.md:149` already demands it).
4. Structural facts stay automatable and MUST have tests where they exist: row
   counts inside a frame, the elision markers, no ANSI leak into `/export`, the
   palette-only rule, `TERM=dumb`/non-TTY no-ops.
5. Any new keybinding is documented in the README AND in the cheatsheet AND in
   `visual-identity.md` § 4.

## Constraints

- Text-only terminal: no Rust, no build step, no new dependencies (ADR-0001).
- Rendering only through `ui/` modules and the `C` palette; keep every existing
  invariant: the print-once frontier (expansion APPENDS; it never repaints a
  committed block), the DEC 2026 wrapper, the frame height budget, the clamp, the
  ADR-0003 lease, the paste-burst path, `TURN_INPUT_MAX_CHARS`.
- Nothing in this brief touches the system prompt or the cache-stable prefix
  (P1-17 owns the prompt's capability policy).
- Design taste is the user's: a `skip` verdict is a legitimate outcome, and no
  phase may "improve" something the audit marked skip.

## Verification (per phase)

```
node --check on every touched file in src/ui/
node --test test/prompt-input-render.test.js test/thinking-stream-append.test.js test/turn-input-cap.test.js
npm run lint && npm test
```
Baseline (2026-10-10): 468 tests / 458 pass / 0 fail / 10 env skips; lint exit 0.
Plus the manual review script (item 2 above) and the before/after capture (item 3).
**Phase 1's "gate" is the user's approval of `audit.md`, not a test suite.**

## Docs sync (Rule 2)

- `docs/visual-identity.md`: the primary artifact of every stage.
- `docs/architecture.md` ui/ row when a new module appears.
- `docs/deep-dive.md` § 19 (UI/UX) + § 21.1 P1-18 rows per stage.
- `README.md` for new keys/commands; `features/terminal-ui.md` Change History;
  `CHANGELOG.md` `[Unreleased]` per stage.