# Design & UX audit — grok-build as the design base

> **Status:** Phase 1 deliverable of `specs/2026-10-11-design-ux-pass` (deep-dive
> P1-18). **Nothing here is implemented** — this document decides *what* to change
> and stops for approval. Every reference citation below was re-verified against
> `C:\Users\mc33p\Documents\GitHub\grok-build` on 2026-10-11; the three that did
> **not** verify as written are corrected in § 11 and in the Appendix.
>
> Reference is Rust; emile is ES modules with no build step (ADR-0001). What is
> ported is the **design decision**, never the code.

**Verdict summary:** 3 adopt · 8 adapt · 0 skip (the anti-pattern section is
adopt-as-rules). Nothing in the reference failed to apply outright; three ideas
needed a non-obvious adaptation because emile commits blocks once rather than
repainting a viewport.

---

## 1. Named semantic token layer, single source

**Reference.** `xai-grok-pager-render/src/theme/mod.rs:1`: *"All colors come from
the `Theme` struct. No hardcoded colors elsewhere."* The struct's fields are roles,
not hues: `accent_user/assistant/thinking/tool/system/error/success/running/skill`
(`theme/tokyonight.rs:56-64`), `accent_plan:86`, `accent_verify:89`,
`accent_remember:92`, `accent_model:101`, `text_primary/secondary:67-68`, the
border quartet `selection_border/hover_border/prompt_border/prompt_border_active`
(`:95-98`), six diff tokens (`:108-113`) and per-level markdown tokens
`md_heading_h1…h6` + `_mod` modifiers, `md_code`, `md_code_bg`, `md_text`,
`md_muted` (`:123-142`).
*Principle: a component asks for a **role** ("this is a running tool"), so the
palette can be retuned without re-deciding meaning at every call site.*

**Emile today.** One source already exists — `src/ui/theme.js:24-37` exports `C`
with 12 entries — but every entry is a **hue** named after its color:
`accent`, `purple`, `gold`, `info`, `success`, `warn`, `red`, `fg`, `muted`,
`ghost`, plus `dim` (SGR 2) and `bold`. The semantic layer lives only in prose:
`docs/visual-identity.md` § 2 maps hue → usage ("`C.gold` — search operations",
"`C.red` — error, failure, command execution"), and § 3 repeats it per component.
Call sites read `C[d.tone]` with a tone *string* (`src/ui/tool-lines.js:20-59`),
so a role is spelled three ways at once (string key → palette entry → meaning).
Consequence in practice: `cache hit: N%` is rendered with `C.success`
(`src/ui/status-bar.js:51`), a *success* token used for a neutral metric, and
`✗` uses `C.red` while the error text beside it is `C.dim`
(`src/agent/agent.js:545`).

**Proposal.** Add a **role layer** over the existing palette in the same module —
no new color, no new dependency:

```
  today                                after
  ─────                                ─────
  C.gold(query)                        ROLE.search(query)      → C.gold
  C[detail.tone]                       ROLE.tool[verb]         → info|warn|red|gold|accent
  C.red('✗') + C.dim(msg)              ROLE.error.head()/detail(msg)
  C.success(`cache: 87%`)              ROLE.meta.metric('cache: 87%')  → C.muted
  (borders: C.muted everywhere)        ROLE.border.{box,panel,active}
```

`ROLE.user / agent / thinking / tool / system / error / success / running /
skill / plan / memory / model` mirror the reference's accent roles; each is an
alias into `C`, so the emitted bytes are **identical**. The tone table in
`visual-identity.md` § 3 becomes the role table, and the review checklist grows
one line: *"did the component name a role, not a hue?"*.

*Cost:* ~40 lines in `src/ui/theme.js`; a mechanical import update in the ~20
`ui/` modules that currently spell hue names; **0 new colors, 0 new rows**.
Files: `src/ui/theme.js` (new export), every `src/ui/*.js` call site,
`docs/visual-identity.md` § 2–3, § 6.

**Verdict: `adapt`.** The single-source principle is already emile's (principle 1
of the visual identity); what is missing is the *role* indirection that makes the
reference's palette retunable. Adopting the reference's struct verbatim would mean
renaming emile's palette and rewriting every call site for zero visual gain —
hence roles added *as aliases*, with a byte-diff gate.

---

## 2. Three-step gray hierarchy by function

**Reference.** `theme/tokyonight.rs:70-74` defines the scale with its purpose in a
comment — *"they provide a consistent hierarchy for secondary/meta text across all
themes"*: `gray_dim` = *"dimmest: meta punctuation (`$`, `(+N/-M)`)"*, `gray` =
*"muted text, comments, collapsed content"*, `gray_bright` = *"tool accents,
secondary labels"*.
*Principle: de-emphasis is a three-step scale chosen by **what the text is**, not
by how dark it looks.*

**Emile today.** emile has four de-emphasis levels and no rule for which to use:
`C.fg` (body, `#A9B1D6`), `C.muted` (`#565F89`), `C.ghost` (`#3B4261`) and `C.dim`
(SGR 2). `docs/visual-identity.md` § 2 gives each one a *use* but the three-way
function split does not exist, and the practice is visibly mixed: `↳ N tools`
(collapsed-count punctuation) uses `C.dim` (`src/ui/response.js:61`), the elision
markers `⌃ N earlier rows` use `C.dim`
(`src/ui/prompt-input-persistent.js`, the marker rows), `(+N chars)` and the
`qued draft: N/16k` counter use `C.muted` and `C.dim` interchangeably, while
borders — a fourth function — are `C.muted` as well.

**Proposal.** Name the three functions and apply them:

```
  today (mixed)                                  after (by function)
  ─────────────                                  ───────────────────
  ⌃ 181 earlier rows      C.dim                  ROLE.meta.punct   = C.dim
  ↳ 20 tools              C.dim                  (+N chars), counters, (…)
  cache hit: 87%          C.muted/success        ROLE.meta.label   = C.muted
  box borders             C.muted                tool args, footers, borders
  collapsed thinking      C.ghost                ROLE.meta.body    = C.ghost
```

Rule to write into § 2: **punctuation and counts are the dimmest step** (SGR DIM);
**labels, args and borders are the middle** (`muted`); **collapsed/secondary body
content is the darkest** (`ghost`). A segment stops using a *state* color
(`success`/`warn`) unless it reports that state — the `cache hit: N%` misuse above
is the concrete bug this rule removes.

*Cost:* 0 new colors, 0 new rows; ~10 call sites re-pointed (mostly
`src/ui/status-bar.js:51`, `src/ui/response.js:61`, the footer segments in
`src/ui/prompt-input-persistent.js:369-395`). Files: `src/ui/theme.js` (role
aliases), those three, `docs/visual-identity.md` § 2.

**Verdict: `adapt`.** emile already has the three levels; the reference supplies
the missing *rule* (function, not darkness) and the missing distinction between
meta punctuation and muted body. Adding a fourth color would be louder for no
reason — the rule is what changes.

---

## 3. Never bright-black for body/secondary text; de-emphasize with DIM

**Reference.** `theme/terminal_default.rs:12-18`: *"Do **not** paint body or status
text as `DarkGray` (ANSI bright black). Many dark profiles deliberately set that
slot very dark for subtle chrome, which washes out tool stdout and the prompt info
bar."* Instead: primary and secondary chrome both use `Color::Reset`, and
`Theme::muted`/`Theme::dim` apply `Modifier::DIM` *"so de-emphasis tracks the
terminal's own fg rather than hard-coded bright black"*. Enforcement is a test over
the whole palette: `terminal_default_uses_only_reset_and_named_ansi` asserts every
field is `Reset` or a named ANSI color — never RGB/indexed.
*Principle: tertiary text keeps the terminal's own foreground and asks for
attention with an attribute, so it stays legible on any background.*

**Emile today.** Partly already right: `C.dim` is `\x1B[2m` on the *user's* fg
(`src/ui/theme.js:35`), and the visual identity's principle 3 (*"hierarchy by color,
not by shouting"*) is the same instinct. The risk is the hardcoded dark gray:
`C.ghost = #3B4261` (`theme.js:29`, comment: *"near-invisible (thinking)"*) is the
collapsed thinking one-liner — `src/ui/thinking.js:122` and `:273`
(`··· thinking` / `··· thought Ns`). On a theme whose background is darker than
`#3B4261`, or on a light-background profile, that text is either invisible or
worse, and it is the **only** place the user is told that reasoning happened.
Separately, emile's palette is true-color with a picocolors fallback (`theme.js:16`),
which the reference's `terminal_default` mode exists to avoid — emile has no
"terminal-native" mode at all.

**Proposal.** Two rules, one small change:

```
  today                                after
  ─────                                ─────
  ··· thought 4s      C.ghost #3B4261  ··· thought 4s      C.dim  (SGR2 on user fg)
  (no rule written)                    visual-identity §2: "tertiary text = SGR DIM
                                        on the terminal's own fg; a hardcoded
                                        near-background gray is never body text"
```

Keep `ghost` for what it is good at (a decorative accent inside an already-visible
line), and use `C.dim` where the text is the *only* signal. Do **not** port the
`terminal_default` mode: emile's truecolor `C` palette is a documented decision
(§ 2) and a second palette is a Stage-A-sized project of its own — record it in
§ 5 as debt if the user wants it.

*Cost:* 0 rows; 2 call sites (`src/ui/thinking.js:122,273`); one new § 2 rule.
Files: `src/ui/thinking.js`, `docs/visual-identity.md` § 2, § 5 (optional debt
entry for a terminal-native mode).

**Verdict: `adapt`.** emile already follows the *DIM* half (and `C.dim` is exactly
the reference's mechanism); the brightness half applies to one token used in one
place. The reference's `terminal_default` palette is `skip`-worthy on its own
(it is a whole appearance mode, not a fix) — noted as debt, not proposed.

---

## 4. Transcript blocks are never boxed

**Reference.** `xai-grok-pager/src/scrollback/layout.rs:15-43`: a block's horizontal
layout is `accent (always 1 column) │ left padding │ content │ right padding`, with
`HorizontalLayout::ACCENT = 1` and no border columns at all — the doc comment at
`:5-6` states *"Selection borders are drawn INTO the outer viewport padding, not as
part of this layout"*. `scrollback/block.rs:40-197` defines the block vocabulary
that goes with it: `accent()` (an optional 1-column rail), `bullet()`
(*"the bullet matches the accent color"*), `accent_background()` and
`background()` (an optional band), plus the fold modes. Borders therefore appear
only on the composer, on selection and in modals (`views/shortcuts_help.rs:10`:
*"Rendered via `ModalWindow` chrome"*).
*Principle: transcript content is distinguished by a **rail + bullet**, and border
chrome is reserved for surfaces the user is interacting with.*

**Emile today.** The opposite convention is documented and enforced:
`docs/visual-identity.md` § 3 *"Open boxes (mandatory)"* — top and bottom borders
only, no side rails, content indented `BOX_INDENT` (4 spaces). The assistant
response is a box: `╭─ emile ───` (`src/ui/response.js:71`) … `╰────`
(`:96`); the diff block is a box (`src/ui/diff-block.js:32,77` — and it uses
*heavy* corners `┌`/`└` where every other box uses rounded `╭`/`╰`, an internal
inconsistency); the memory/rules/skills panels are boxes. So every *agent* prose
block in the transcript carries border chrome that the reference reserves for the
composer.

Worth stating why emile's rule exists: side rails were removed in pass 3 because
aligning a right rail requires right-padding math over `stripAnsi().length`, which
is not display width for wide/emoji characters (`visual-identity.md` § 3 and § 5
"Resolved in pass 3"). That constraint is about the **right** edge only.

**Proposal.** Replace the response box's top/bottom borders with a **left-only
rail** — which needs no right-padding math at all, so it is compatible with the
constraint that killed side rails:

```
  today                                after
  ─────                                ─────
    ╭─ emile ──────────────────         ▌ Here is the plan.
                                            Explain the trade-off in
    ·                                   ▌ one more paragraph.
        Here is the plan.
        Explain the trade-off…            (: rail = ROLE.agent, 1 col,
    ·                                      content indents 4 → 2 after it)
    ╰──────────────────────────
```

Rules: transcript prose (assistant response, diff, thinking) uses the rail;
**boxes stay** for the composer/frame, panels opened by a command
(`/memory`, `/rules`, `/skills`, `/cost`) and modals — i.e. exactly the reference's
split. The agent label `emile` moves into an inline dim prefix on the first row
(`▌ emile` or a first-row label), so the block is still identifiable without a
border. Row delta: **−2 rows** per response (the two border rows), so a long turn
gets shorter, not longer.

*Cost:* `src/ui/response.js` (−2 rows), `src/ui/diff-block.js` (corners unified),
`docs/visual-identity.md` § 3 (the mandatory-open-box rule becomes "no side rails,
no right-padding math; transcript prose uses a rail, interactive surfaces use open
boxes"), and the existing render tests that assert `╭` counts
(`test/prompt-input-render.test.js` — those are about the *prompt*, which keeps its
box; `test/mcp-tool-visibility.test.js` asserts tool alignment, unaffected).

**Verdict: `adapt`.** The reference's mechanism (rail + bullet, no box) is
demonstrably better for a *transcript* and the reference proves it is implementable
without the right-edge math emile banned. It cannot be `adopt` because it amends a
documented contract, so it is the first Open Question rather than a stage default.

---

## 5. Asymmetric user/agent treatment

**Reference.** The user's own prompt gets the elevated treatment: an optional band
(`blocks/user.rs:188-209`, `prompt_band_color_for` → `bg_light`, suppressed in
minimal/terminal-native mode where *"their prompt rows have no band, so the pointer
is the turn cue"*) plus a pointer prefix — `blocks/user.rs:263-271` selects
`"$ "` for bash, `↻` for cron and otherwise `crate::glyphs::prompt_arrow()`, which
is `"❯ "` (`glyphs.rs:15-22`). The agent's prose deliberately gets **nothing**:
`blocks/agent.rs:180-182` returns `accent() → None` and `has_vpad_for → false`.
*Principle: the transcript reads as a dialogue because only one side is decorated —
the user's turn is marked, the agent's is plain prose.*

**Emile today.** The user message is a full-width rule:
`  ── <message> ────` with `C.fg` text and `C.muted` dashes
(`src/ui/user-message.js:39-41`), documented in § 3 as the "chapter marker". The
agent gets a *box* (idea 4) — so today the decoration is inverted: the agent's turn
is the loud one, the user's is a rule. There is no pointer (`❯` is reserved for the
prompt input row, § 3) and no band anywhere.

**Proposal.** Keep the divider (it is the turn boundary and it is already the
rhythm anchor) and add the pointer; drop the band:

```
  today                                after
  ─────                                ─────
    ── refactor the auth flow ────       ❯ refactor the auth flow
                                         ────────────────────────────
```

The pointer is inline on the message row (row delta **0**), `ROLE.user`; the rule
stays `muted`; the `›`/`❯` collision with the input field is avoided because the
prompt row is only on screen between turns *and* uses the accent while the
transcript uses `ROLE.user` — if the user prefers zero ambiguity, the transcript
pointer can be `▌` (the rail glyph from idea 4) instead.

*Cost:* `src/ui/user-message.js` only (one row rewritten, 0 added); 1 line in § 3.
Optional band = 1 SGR pair per line, not recommended on `dumb`/legacy terminals.

**Verdict: `adapt`.** The `❯` pointer is cheap and makes the dialogue legible at a
glance; the full band is `skip` for now (it is a background fill, which the
reference itself disables in its terminal-native mode, and emile has no mode
system). The either/or is in the Open Questions because it touches the glyph
reserved for input.

---

## 6. Registry-driven discoverability (hint bar + cheatsheet)

**Reference.** One type feeds both surfaces: `views/shortcuts_bar.rs:19-34` defines
`HintItem { keys: Vec<KeyShortcut>, label, custom_display, description, pinned }`
and the module doc (`:1-3`) states the bar *"accepts `&[HintItem]` from any source
(…) each view builds its own hints dynamically"*, and that a pending confirmation
*"replaces all hints with 'press again to {label}'"*. `pinned` is defined at `:31-33`
as *"the hint survives compact-mode truncation and renders regardless of
`max_visible`"*. The cheatsheet (`views/shortcuts_help.rs:1-15`) is the same
registry grouped by category, with search matching *"key display, description,
label, and long help"*, opened by `Ctrl+.` / `Ctrl+X` and rendered with modal
chrome.
*Principle: a key is discovered where it is relevant, and all of them are
enumerable in one place — from a single table, so the two surfaces cannot drift.*

**Emile today.** **Not present.** There is no hint bar, no cheatsheet and no key
registry: the prompt footer shows state, not affordances
(`src/ui/prompt-input-persistent.js:369-395` → `plan (Tab) · model (effort) ·
~tokens: … · cache hit: … · MCP: …`), and the only key hints are two hardcoded
strings — the slash-command menu labels and
`  ↑↓ select  Enter choose  Esc cancel` inside the model picker
(`src/ui/model-picker.js:143`). `README.md` documents the keys, and `/help` is the
in-REPL reference. Free keys verified today: **`Ctrl+E`, `Ctrl+F`, `Ctrl+G`,
`Ctrl+H`, `Ctrl+.`** (reserved: `Ctrl+C`, `Ctrl+P` = `/thinking`, `Ctrl+T` = effort,
`Ctrl+U`, `Ctrl+D` in the switch picker; `Tab` = plans mode).

**Proposal.** Port the mechanism *and* reuse emile's existing row budget:

```
  today (idle prompt footer, 1 row)
  ─────
    plan (Tab) · flash (high) · ~tokens: 42k / 1M (4%) · MCP: 1/1

  after (same row, hints when the draft is empty)
  ─────
    plan (Tab) · flash (high) · ~tokens: 42k / 1M (4%)     ^E thinking  ^. keys  esc clear
    └─ state segments ───────────────────────────────┘     └─ pinned hints, dropped one by one
                                                              from the RIGHT as width shrinks

  after (Ctrl+. — cheatsheet modal, on demand, 0 permanent rows)
  ─────
    ╭─ keys ─────────────────────────────── Search: ▏─────
    ·  Essentials
    ·    Enter        send the draft
    ·    Shift+Enter  newline
    ·    Esc          clear the draft / cancel the turn
    ·  Turns
    ·    ^E           expand the last thinking block
    ·    ^T           cycle reasoning effort
    ╰──────────────────────────────────────────────────────
```

One `src/ui/hints.js` table (`{keys, label, description, pinned, when}`) feeds:
(a) the bar (footer's trailing segments, **no new row** — it competes for the
existing footer row and drops pinned-last-first under narrow widths), (b) the
cheatsheet modal on `Ctrl+.` (free, matches the reference, and `Ctrl+.` needs no
new slash command), (c) contextual hints inside surfaces that already print one
(model picker: replace the hardcoded string with a registry lookup), and (d) the
armed-action echo (`press ^C again to cancel` — emile already behaves this way for
the force-exit, so the copy becomes honest).

*Cost:* 0 new rows (bar rides the footer); 1 new module + 1 new panel (~150 lines);
1 new key (`Ctrl+.`, free and non-colliding); hint text must never echo a prompt,
command or query (same rule as the window title). Files: new
`src/ui/hints.js`, new `src/ui/shortcuts-panel.js`, the footer in
`src/ui/prompt-input-persistent.js`, `src/ui/turn-keys.js` (active-turn footer),
`src/ui/model-picker.js`, `docs/visual-identity.md` § 3/§ 4, `README.md`.

**Verdict: `adopt`.** This is the reference mechanism that maps most cleanly onto
emile: the registry is plain data, the bar fits an existing row, the modal needs no
framework, and the payoff is precisely the user's complaint (features exist and are
undiscoverable). Only the placement is adapted (footer segments instead of a
dedicated bar row) to protect the row budget.

---

## 7. In-situ expand affordances

**Reference.** `xai-grok-pager-render/src/appearance/config.rs:114-123`:
`expandable_indicator` — *"the selected entry's bullet is replaced with an expand
indicator (e.g. `›`) if the block is foldable and collapsed"*, with
`expandable_indicator_char` defaulting to `›` and `expandable_indicator_running` for
blocks that are still streaming. The hint itself is
`scrollback/blocks/thinking.rs:16-44`: `const EXPAND_HINT: &str = "ctrl+e to
expand"`, appended as a **dim span to the existing line**, guarded twice — only in
`DisplayMode::Collapsed` (*"There the hint would be a lie"*) and only
*"if `used + hint.width() <= ctx.content_width()`"*, so it can never add a row.
`appearance/config.rs:111-113` adds the selection rule: the highlight is inset so
*"the borders remain uncolored"*.
*Principle: the affordance appears exactly where the collapsed content is, costs no
row, and never lies about a block that cannot expand.*

**Emile today.** **Not present.** The collapsed thinking one-liner is
`··· thinking` → `··· thought Ns` in `C.ghost`
(`src/ui/thinking.js:122` and `:273`; `printThinking` at `:303-330` for replayed
history), and nothing says it can be reopened — the only way to find out is to know
`/thinking` or `Ctrl+P` from the README. `docs/visual-identity.md` § 3 describes the
two states but no affordance. Note the constraint: `thinking.js:9-17` commits a
closed block **once** through the print-once frontier.

**Proposal.** Two halves, both append-only:

```
  today
  ─────
    ··· thought 4s

  after (the hint rides the line that is already committed; 0 extra rows)
  ─────
    ··· thought 4s · ^E to expand

  after ^E (APPENDS below — the committed line is never repainted)
  ─────
    ··· thought 4s · ^E to expand
    ✻ Thinking (expanded)
        …the full reasoning, muted, wrapped…
```

- the hint is part of the collapsed line at the moment it is written, so the
  print-once rule is untouched (`thinking.js:273`, `:322-324`), and it is **omitted
  when there is nothing to expand** (the reference's "a lie" guard) and when the
  line would exceed the width (the reference's second guard);
- `Ctrl+E` expands the **most recent** collapsed thinking block by printing the
  expanded content as a new block below (same muted body `printThinking` already
  renders for history), never rewriting the collapsed line — an explicit
  consequence of the frontier, and the reason this is `adapt` and not `adopt`;
- the same `(hint)` mechanism is then available to any foldable block (the diff
  block's truncated variant, a long tool output).

*Cost:* 0 new rows for the hint; the expansion itself is as tall as the content (the
user asked for it); 1 new key (`Ctrl+E`, free). Files: `src/ui/thinking.js`
(hint + expand path), `src/ui/hints.js` (register the key), the prompt/turn
keypress handlers (`src/ui/prompt-input-persistent.js`, `src/ui/turn-keys.js`),
`docs/visual-identity.md` § 3/§ 4, `README.md`.

**Verdict: `adapt`.** The reference's *in-situ bullet swap* cannot be ported (it
repaints a foldable row in a redrawn viewport; emile's committed blocks are
immutable), but its two guards and its chord are exactly right and the hint costs
nothing. The append-based expansion is the honest emile equivalent.

---

## 8. Verb-grouping of adjacent tool rows

**Reference.** `scrollback/blocks/tool/mod.rs:71-145`: `VerbGroupKind` classifies a
row (`File`, `Skill`, `Search`, `Dir`, `WebFetch`, `WebSearch`, `MemorySearch`,
`IntegrationSearch`, `Subagent`, `Command`, `EditFile`, `McpCall`, `Message`,
`OtherTool`), `verb(running)` returns **present tense while running, past
otherwise** (`("Read","Reading")`, `("Searched","Searching")`, `("Ran","Running")`,
`("Called","Calling")`…), and `noun(count)` pluralizes (`file/files`,
`pattern/patterns`, `MCP tool/MCP tools`). `state/verb_group.rs:1-10` describes the
label (*"Builds the 'Read 10 files, Ran 2 subagents' header label for a folded run
of consecutive non-destructive tool calls"*) and states that the *same* bucket
vocabulary labels the truncation header, *"so the two label families can't drift"*.
The fold threshold and the truncation header live in `state/layout.rs` +
`render.rs:444` (*"Group-header entries draw synthetic 'N more' text"*), i.e. the
overflow is a **synthetic 'N more' row**, not the `╶╶ N more` glyph the brief
claimed (see § 11).
*Principle: a batch of similar operations is one line of prose — verb + count +
noun — in the tense that matches its state.*

**Emile today.** One row **per tool call**, always: `printToolSummary`
(`src/ui/tool-lines.js:100-142`) emits `  ● <label 8ch> <dim arg>` per call
(`:132-134`, `LABEL_W = 8`) with its own semantic tone, then increments
`turnState.toolsRun` (`:138`) which becomes the dim `↳ N tools` header above the
response (`src/ui/response.js:59-63`). A turn that reads 20 files prints 20 rows
plus the count — the count is the only grouping that exists, and it lives in a
different block. `docs/visual-identity.md` § 3 documents the grid as the tool
vocabulary; § 5's "Resolved in pass 1" line ("tool calls without visual grouping")
referred to the *grid*, not to verb grouping.

**Proposal.** Group adjacent same-verb calls into one row, keeping the grid for
mixed batches:

```
  today (20 reads + 3 greps + 1 edit)          after
  ─────                                        ─────
    ● read   a.js                                ● read   a.js, b.js, … +18 more
    ● read   b.js                                ● grep   /auth/, /token/, /sess/
    ● read   c.js                                ● edit   src/auth.js
    … (16 more read rows)
    ● grep   /auth/                            tense follows state:
    ● grep   /token/                             ● Reading 20 files      (running)
    ● grep   /sess/                              ● Read 20 files        (done)
    ● edit   src/auth.js                         ● Searched 3 patterns  (done)
    ↳ 24 tools
```

Design rules (the reference's, adapted to a batch API): group only **adjacent**
rows; group the *non-destructive* verbs (`read`/`list`/`find`/`grep`/`web`/
`recall`), and keep side-effect operations (`write`/`edit`/`exec`/`mcp`/`plan`) as
their own rows because their argument *is* the information; show up to **3**
distinct arguments inline then `+N more` (a count, never a fabricated summary); keep
the existing semantic tone per group verb; and keep `↳ N tools` (it is the turn's
total, a different fact from the batch). emile can do this **statelessly** —
`printToolSummary` already receives the whole batch — so no cross-batch accumulator
is needed (the reference needs one because it folds inside a scrollback model).

*Cost:* 0 new rows (strictly fewer: N rows → ~1 row per verb class); no new key, no
new token; existing per-line tests must keep passing (they assert alignment and
sanitization). Files: `src/ui/tool-lines.js` (grouping pass + label builder),
`src/ui/turn-state.js` (the counter stays), `docs/visual-identity.md` § 3,
`test/mcp-tool-visibility.test.js` (alignment cases), `features/terminal-ui.md`.

**Verdict: `adopt`.** Highest payoff per unit of risk in the whole audit: it makes
long turns dramatically shorter, it is pure presentation over data emile already
has, it changes no contract, and the reference's tense/count/noun vocabulary can be
lifted as a design (with emile's own verbs). The truncation header is `adapt`ed to
`+N more` inside the group row rather than a separate synthetic row — one fewer row
than the reference.

---

## 9. One turn-status line that degrades by width

**Reference.** `views/turn_status.rs:1-37` documents a single-row widget:
`⠧ Run command 0.2s              1m20s ⇣12k [stop]` — spinner (left, *"slowed to
~7.5fps"* via `SPINNER_DIVISOR = 4`), activity label (*"colored per activity type,
truncates if needed"*), phase timer `Xs` (*"gray, never truncates"*), an optional
queued-send hint, the turn timer + token count right-aligned, and a right-aligned
`[stop]` (*"red on hover"*). Degradation is explicit:
`PHASE_TIMER_MIN_WIDTH: u16 = 60` — *"Rows narrower than this hide the phase timer,
which would sit beside the right-aligned turn timer and read as one confusing pair
of numbers. The turn timer stays."* Idle-but-busy work pulses at half speed:
`MONITOR_PULSE_DIVISOR = 8` versus the spinner's `4`, *"The idle still-running cue
should breathe calmly rather than read like the active turn spinner."* The row is
hidden when idle (*"0 height"*).
*Principle: one row answers "what is happening, how long, how much, and how do I
stop it" — and it sheds pieces by width instead of wrapping.*

**Emile today.** Split across three surfaces and missing facts: the spinner row
shows a braille frame + a label (`src/ui/spinner.js:11-15` frames and
`RESPONSE_WAITING_LABEL = 'Thinking and responding…'`, `:68` amber while thinking,
`:79` `setInterval(render, INTERVAL_MS)` with `INTERVAL_MS = 80`), the prompt footer
shows model/tokens/cache/plan/MCP (`src/ui/prompt-input-persistent.js:369-395`), and
the turn's tool count appears later as `↳ N tools`. There is **no elapsed time**,
**no token delta**, and **no `[stop]` affordance** — cancellation is Esc/Ctrl+C,
documented only in the README. The active-turn frame's footer is the same builder
(`src/ui/turn-keys.js`), so a status line would ride along with it; and emile has
one animation speed (80 ms), i.e. no calm/idle distinction.

**Proposal.** Turn the spinner row into the status line (replacing it, not adding):

```
  today (2 surfaces, missing facts)
  ─────
    ⠧ Thinking and responding…                  ← spinner row (80ms animation)
    …prompt frame…
      plan (Tab) · flash (high) · ~tokens: 42k / 1M (4%) · MCP: 1/1   ← footer

  after (one row, degrading by width; footer keeps state only)
  ─────
    wide (≥100 cols):  ⠧ Run command 0.2s · parse the config        1m20s ⇣12k  esc stop
    narrow (80 cols):  ⠧ Run command 0.2s                           1m20s ⇣12k
    tiny (60 cols):    ⠧ Running                                    1m20s
```

Rules ported: the phase timer disappears below **60 columns** (same threshold and
same reason — two adjacent numbers confuse); the elapsed timer stays; the token
delta (`⇣12k`, from `stats` emile already tracks) appears only when it is known
(never `⇣0k` — see idea 10); `[stop]` is not a clickable button (emile has no mouse
UI) but the dim hint `esc stop`, which reuses the hint registry from idea 6. The
idle-but-busy case (`busy.isBusy()` with no chunk yet) pulses at **half** the active
speed — emile's spinner already renders a static frame when not thinking
(`spinner.js:68`), so this is a second interval multiplier, not new animation.

*Cost:* **0 new rows** (replaces the spinner row); no new key (Esc/Ctrl+C already
cancel); 1 new module boundary at most (`src/ui/turn-status.js`) plus the call sites
in `src/ui/spinner.js`, `src/ui/turn-keys.js` (footer wiring) and the spinner label
plumbing in `src/agent/agent.js`. Files: new `src/ui/turn-status.js`,
`src/ui/spinner.js`, `src/ui/turn-keys.js`, `src/agent/agent.js`,
`docs/visual-identity.md` § 3, `README.md`.

**Verdict: `adapt`.** The single-row, width-degrading, calm-when-idle idea is
exactly what emile lacks; the `[stop]` *button* is `skip` (no mouse layer, and
adding one would be a framework decision emile has avoided), replaced by a dim key
hint. Replacing rather than adding the row keeps the row budget intact.

---

## 10. Typed, non-fabricating feedback

**Reference.** `app/error_display.rs:1-3` states the contract — it *"Turns raw ACP /
`RetryState` dumps (`API error (status 500): {"error":…}`) into the same kind of
short warning banner used for 401 re-auth"* — and does it with a **typed** kind:
`WireErrorType` (`:8-24`, 14 variants) whose `parse` maps *"unknown strings to
`Other` rather than being matched as raw `&str` at call sites"* (`:6-7`), and a
two-part payload (`:75-90`): `headline`, `detail`, rendered by
`banner_message` as *"`Headline: detail` (headline alone when there is no detail)"*.
The non-fabricating half is spread but consistent: completion is
`Worked for 2.3s` and deliberately period-less (`scrollback/blocks/session_event.rs:375-379`,
`// Deliberately period-less: don't re-punctuate`), cost below
`MIN_DISPLAYED_COST_USD: f64 = 0.005` is **not shown**
(`views/status_line/segments.rs:18`), and one line per outcome only — auto-compaction
notifications *"stay quiet"* because the outcome is painted elsewhere
(`app/acp_handler/session_notification.rs:1660`). (The brief's "a successful
compaction is deliberately invisible" is a stronger claim than the tree supports:
`session_event.rs:425-439` does render `Context compacted: A → B tokens`, with tests
pinning the format — see § 11.)
*Principle: state the kind, state the action, omit what is unknown — never print a
placeholder or a raw dump.*

**Emile today.** The **content** is already close: `formatApiError`
(`src/api/transports/base.js:90-160`) classifies status/code into actionable
sentences (`Authentication failed. Check your API key with /connect.`,
`Model "x" not found for this provider. Use /model to switch.`,
`Context window exceeded. Compressing history and retrying...`), redacts bearer
tokens/`sk-`/`api_key: …`, collapses whitespace and caps the detail at 160 chars —
documented in `features/error-ux.md`. The **form** is flat: call sites print a
glyph plus the whole sentence dimmed —
`✗ ${C.dim('Stream error: ' + formatApiError(...))}` (`src/agent/agent.js:545`) and
similar `⚠`/`⏹` lines at `:329,336,353,395,403,423,658,663,696`; there is no
headline/detail split, no typed kind the renderer can style, and the actionable
part is dimmed along with the rest — the least legible thing on screen is advice.
Also `docs/visual-identity.md` § 5 still lists *"No dedicated visual treatment for
API error/model fallback (flat message)"* as open debt.

**Proposal.** Keep `formatApiError`'s content and redaction; give it a **shape**:

```
  today                                     after
  ─────                                     ─────
    ✗ Stream error: Authentication             ✗ Authentication failed
      failed. Check your API key                 ↳ check your API key with /connect
      with /connect.                             ↳ retried 2 times · provider: requesty

    (everything dimmed)                      headline = ROLE.error (red, not dim)
                                             detail   = ROLE.meta (dim, 1 row each)
                                             unknown fields omitted entirely
```

A tiny typed envelope (`{ kind, headline, detail, action }`, `kind` from a closed
set mirroring `WireErrorType`: `auth/mode/quota/context/server/network/cancel/…`)
returned by the API layer, rendered by one new `src/ui/error-banner.js`; the
`⚠` non-error notices (loop cap, fallback, cancel) become a one-line `kind`-styled
variant of the same renderer so the transcript stops having four subtly different
one-liners. Non-fabrication rules written into § 3: an unknown value is **omitted**
(no `0`, no `$0.00`, no `retried 0 times`); estimated token counts keep the existing
`~`; and the cost line is hidden below **$0.005** (`/cost` keeps the exact figure,
because that is the command whose purpose is the number).

*Cost:* 0 new rows for errors that already print one line; +1 row per extra detail
line (only when a detail exists, like the reference's two-part payload);
0 new keys/tokens beyond `ROLE.error`. Files: `src/api/transports/base.js` (return a
typed object; keep the string helper for compatibility), new
`src/ui/error-banner.js`, the 10 call sites in `src/agent/agent.js` + `src/cli.js`,
`docs/visual-identity.md` § 3/§ 5, `features/error-ux.md`.

**Verdict: `adapt`.** The type/redaction/next-step work already exists and is good;
what is missing is the two-part form, the calm styling of the headline, and the
omit-when-unknown rule — all renderer-side, no new classification logic.

---

## 11. Anti-patterns as rules

**Reference.** Five documented *don't*s, each with a reason:
(i) **terse, period-less status copy** — `session_event.rs:375`,
`// Deliberately period-less: don't re-punctuate` (note the nuance: the same enum
keeps `"Turn completed."` for the no-elapsed variant at `:381`, so the rule is
*don't add a sentence to a status fragment*, not "never a period");
(ii) **no animation that could read as broken** — `notifications/title.rs:17-20`
holds the "⚠ Action Required" toggle for ~500 ms on / ~500 ms off: *"a calm 1s blink
cycle that reads as intentional rather than broken flickering"*, and freezes it
while focused *"to eliminate oscillation"*;
(iii) **never recolor block borders on selection** —
`appearance/config.rs:111-113`: *"When false (default), the highlight is inset by 1
column on each side so the borders remain uncolored"*;
(iv) **legacy-glyph fallbacks** — `glyphs.rs:1-7`: chrome glyphs that the legacy
Windows console font lacks get ASCII/CP437 substitutes (*"ConHost does no font
fallback, so missing glyphs render as tofu"*), with `prompt_arrow()` returning
`"❯ "` or `"> "` and a fixed 2-column width;
(v) **one line per outcome** — `session_notification.rs:1660` (quiet arms because
the outcome is painted elsewhere).
*Principle: copy, motion, selection and glyphs each have a failure mode that reads
as a bug even when the code is correct.*

**Emile today.** Partly followed by instinct, never written down.
(i) emile's status lines are already terse and period-less —
`  ⏹ Turn canceled.` (`src/agent/agent.js:329`) has a period while
`  ✻ Thought for 4s` (`src/ui/thinking.js:273`) does not; `RESPONSE_WAITING_LABEL`
(`src/ui/spinner.js:15`) is period-less while the empty-response notice is
`· (empty response)`. So the corpus is inconsistent, not wrong.
(ii) motion exists without a rule: the spinner is a fixed 80 ms
(`src/ui/spinner.js:12`) and the same speed is used whether the turn is actively
working or idle-waiting.
(iii) no selection concept exists outside the pickers (which use `●` +
`bold(accent)`, `src/ui/model-picker.js:127-133`) — so the rule is easy to keep.
(iv) **real gap on this machine's platform**: emile prints `❯ ● ⠋ ╭ ╰ │ ⌃ ⌄ · ⋯`
unconditionally; the legacy Windows console (the user's platform) has no font
fallback, and emile has no equivalent of `is_legacy_windows_console()`.
(v) close enough to compliant (one line per outcome) but not stated.

**Proposal.** Add a **§ 3.1 "Copy, motion and glyph rules"** to
`docs/visual-identity.md`, and implement the one item that is broken rather than
unwritten:

```
  rule                                    emile action
  ────                                    ────────────
  status fragments are period-less        audit the ~20 status strings; drop the
  (a sentence is not a status)            period from `Turn canceled.`/`… failed.`
  motion is calm when idle                idea 9 (half-speed pulse when busy-with-no-chunk)
  selection never recolors borders        keep (nothing to change) + write it down
  chrome glyphs need a legacy fallback    add a small glyph table with the reference's
                                          shape: `❯→>`, `●→*`, `⠋→|`, `╭╰→+-`, `│→|`
                                          chosen by the same condition (legacy conhost),
                                          keeping the 2-column width stable
  one line per outcome                    keep + write it down
```

The glyph fallback is a *correctness* item on Windows, not a taste item: the
condition can be derived without a dependency (Windows + no `WT_SESSION` + no
`TERM_PROGRAM`, `TERM=dumb`), and the fallback must preserve each glyph's display
width so the cursor math and the tests stay valid.

*Cost:* 0 rows; ~25 strings reviewed; a small table + one predicate
(`src/ui/glyphs.js`) consulted by the modules that print chrome glyphs;
`docs/visual-identity.md` § 3.1 + § 6 checklist lines. Files: new `src/ui/glyphs.js`,
`src/ui/{theme,thinking,spinner,user-message,tool-lines,diff-block}.js`,
`docs/visual-identity.md`.

**Verdict: `adopt` (as rules) · `adapt` (the glyph table).** The rules cost nothing
and prevent the "looks like a bug" class; the glyph table is the only part that
changes output, and only on legacy consoles.

---

## Prioritized proposal list

Ordered by user-visible payoff per unit of risk. "Stage" is the plan's slot
(A is a prerequisite, which is why it leads the stage plan even though its own
payoff is indirect).

| # | Proposal (idea) | Stage | Why this rank |
|---|-----------------|-------|----------------|
| **P0-1** | Verb-grouping of adjacent tool rows (8) | B | A 20-read batch collapses from 20 rows to 1: the largest everyday readability win, pure presentation, no contract touched, and emile already has the whole batch in hand. |
| **P0-2** | Role layer over the palette + gray-by-function rules (1, 2) | A | Prevents the other five stages from inventing meanings; zero visual change when done as aliases, and it retires a real misuse (`cache hit` in `success`). |
| **P0-3** | Non-fabricating rules + typed error banner form (10, 11-i/v) | B | Errors are the moment users most need the screen to be calm and explicit; content already exists, only the form changes, and it fixes the "advice printed in the dimmest ink" bug. |
| **P1-4** | Hint registry: footer hint bar + `Ctrl+.` cheatsheet (6) | C | Turns existing features (expand, effort, plans, memory) from "documented in README" to "visible where used", in an existing row. |
| **P1-5** | In-situ expand affordance + `Ctrl+E` (7) | B | Reasoning is invisible by default and unrecoverable without the README; the hint costs 0 rows, the expansion appends. |
| **P1-6** | Turn-status line that degrades by width (9) | D | One row answers activity + elapsed + tokens + how to stop; replaces the spinner row, so the row budget is unchanged. |
| **P2-7** | Rail vocabulary for transcript prose (4) | B | Improves the transcript's balance (agent no longer the loudest thing) and *removes* 2 rows per response — but it amends a documented rule, so it needs the taste decision first. |
| **P2-8** | Asymmetric user treatment: pointer (5) | B | Cheap dialogue legibility (1 row rewritten); the band is skipped, and the pointer overlaps the input glyph, so it is a taste call. |
| **P2-9** | Copy/motion/glyph rule set (11-i/ii/iii/v) | D | Costs nothing; prevents the "reads as broken" class. Fold into the stage that touches the strings. |
| **P3-10** | Legacy-console glyph fallbacks (11-iv) | F | Correctness on ConHost, invisible elsewhere; needs the narrow-width/terminal audit from Stage F to enumerate the glyphs. |
| **P3-11** | The five § 5 debt items (debt) | F | After the vocabulary exists: narrow-width audit first, then `/cost` in the box vocabulary, error/fallback states, picker radio-style selection, chained-tool progress. |
| **P3-12** | Markdown emphasis rules written down + diff parity (E) | E | Documentation plus corner-glyph unification (`┌└` → `╭╰`); low risk, low visibility, but it is the contract that keeps the rest stable. |

---

## Open questions for the user

Each one is a decision I should not make alone; the audit's default is stated so a
"no answer" still leaves a defensible path.

1. **Response block: rail or box?** (idea 4) — *Rail* (left `▌` + indent; 2 rows
   shorter per response, transcript reads as prose; amends the mandatory-open-box
   rule for transcript blocks) **or** *keep the open box* (nothing changes, the
   agent stays the most decorated block)? Default if unanswered: keep the box, and
   the rail becomes a Stage F item.
2. **User message: pointer, band, or as-is?** (idea 5) — *Pointer + rule*
   (`❯ refactor the auth flow` over the divider; 0 new rows) **or** *pointer +
   background band* (louder, and background fills misbehave on `dumb`/legacy
   terminals) **or** *keep the divider alone*? Default: pointer + rule.
3. **`Ctrl+E` semantics** (idea 7) — *Expand the most recent thinking block only*
   (one key, one job) **or** *cycle collapsed → truncated → expanded* like the
   reference's three display modes (more power, more state, and "truncated" needs a
   line budget)? Default: expand-only in Stage B; the cycle is its own spec later.
4. **Cheatsheet entry point** (idea 6) — `Ctrl+.` (matches the reference, free)
   **or** a `/keys` slash command (discoverable through the existing `/` menu) **or**
   both? Default: `Ctrl+.` plus `/keys` as an alias, since the slash menu is already
   emile's discovery surface.
5. **Hint bar behaviour** (idea 6) — *always visible while the draft is empty*
   **or** *only until the first turn of a session* (onboarding-style, then quiet)
   **or** *opt-in via `/hints on`*? Default: always while idle and empty, because a
   bar that disappears cannot be re-learned.
6. **Grouping threshold and scope** (idea 8) — group from **2** similar adjacent
   calls or from **3**? And should `exec`/`write`/`edit` ever group (the reference
   keeps them label-only because the argument is the information), or is a compact
   `● edit 3 files` acceptable when the paths are long? Default: threshold 3,
   side-effect verbs never group.
7. **Turn-status: replace the spinner row or add a row?** (idea 9) — *Replace*
   (row budget unchanged; the spinner's braille animation moves into the status
   line) **or** *add a row above the prompt* (more information, one permanent row
   in every turn)? Default: replace.
8. **Legacy-console glyph fallbacks** (idea 11-iv) — do you ever run emile in
   classic `cmd.exe`/`powershell.exe` (ConHost), or always in Windows Terminal?
   If always Windows Terminal, the glyph table is dead weight and can be a Stage F
   `skip` with a note in § 5 instead. Default: implement the table (it is small and
   the failure mode is tofu).

---

## Appendix — reference citations: verification log

Verified 2026-10-11 against `C:\Users\mc33p\Documents\GitHub\grok-build`.

| # | Cited as | Result |
|---|----------|--------|
| 1 | `theme/mod.rs:1` "all colors come from the Theme struct" | ✅ exact (module doc, line 1) |
| 1 | `accent_user/assistant/thinking/tool/system/error/success/running/skill` | ✅ `theme/tokyonight.rs:56-64` |
| 1 | "`accent_memory`" | ❌ **does not exist** — the memory-adjacent role is `accent_remember:92` ("Green accent for `#` remember mode"); `accent_model:101` also exists. Corrected in § 1 |
| 1 | border tokens, diff tokens | ✅ `selection_border/hover_border/prompt_border/prompt_border_active` `:95-98`; six diff tokens `:108-113` |
| 1 | "`md_*` per heading level" | ✅ but the names are `md_heading_h1…h6` + `_mod` (`:123-136`), not `md_h1/md_h2`. Corrected in § 1 |
| 2 | `theme/tokyonight.rs:70-74` three-step gray by function | ✅ exact (comments carry the function) |
| 3 | `theme/terminal_default.rs:12-18` never bright-black, DIM instead, "test-enforced" | ✅ `:12-18` verbatim; the test (`terminal_default_uses_only_reset_and_named_ansi`) enforces *Reset-or-named-ANSI*, while the DIM application is documented at `:15-17`. Stated precisely in § 3 |
| 4 | `scrollback/layout.rs:15-43` 1-column rail, no box | ✅ (`ACCENT = 1`, accent/padding/content columns, selection borders outside) |
| 4 | `block.rs:40-197` blocks + band | ✅ `BlockContent` trait: `accent`, `bullet`, `accent_background`, `background`, fold modes |
| 5 | `blocks/user.rs:188-227`, `:263-271` band + pointer | ✅ (`prompt_band_color_for`, `prompt_styles`; `prompt_arrow()` / `"$ "` / `↻`) |
| 5 | `blocks/agent.rs:180` agent prose has no accent | ✅ `fn accent(...) -> Option<AccentStyle> { None }` (and `has_vpad_for → false` at `:184`) |
| 6 | `views/shortcuts_bar.rs:1-34` `HintItem{keys,label,description,pinned}` + "press again to {label}" | ✅ (`:20-34`, module doc `:1-3`) |
| 6 | `views/shortcuts_help.rs:1-15` grouped cheatsheet | ✅ (`Ctrl+.`/`Ctrl+X`, grouped by `Category`, search over key/description/label/long help) |
| 7 | `appearance/config.rs:114-123` bullet → `›` for foldable collapsed | ✅ **but the path is `xai-grok-pager-render/src/appearance/config.rs`**, not `xai-grok-pager/src/...`. Corrected in § 7 |
| 7 | `blocks/thinking.rs:16-44` `(ctrl+e to expand)` that must not add a row | ✅ `EXPAND_HINT` `:18`, width guard `:36-40`, `Collapsed`-only guard `:25-34` |
| 8 | `tool/mod.rs:71-145` verb-grouping, tense, pluralization | ✅ (`VerbGroupKind` `:74-105`, `verb(running)` `:107-126`, `noun(count)` `:128-145`) |
| 8 | "overflow as `╶╶ N more`" | ❌ **did not verify** — no such glyph/string in the tree; the real mechanism is a *synthetic* `"N more"` group-header row (`scrollback/render.rs:444`, label from `truncation_header_label` in `state/verb_group.rs:9-10`). Corrected in § 8, and the proposal folds the count into the group row instead |
| 9 | `views/turn_status.rs:1-37` single row, degradation, half-speed pulse | ✅ verbatim: layout `:3`, `SPINNER_DIVISOR = 4` `:27`, `MONITOR_PULSE_DIVISOR = 8` `:28-31`, `PHASE_TIMER_MIN_WIDTH = 60` `:34`, hidden when idle `:13` |
| 10 | `app/error_display.rs:1-3` typed banner, never a raw dump | ✅ plus `WireErrorType` `:8-24`, `{headline, detail}` `:79-80`, `banner_message` (`headline: detail`) `:84-90`, and a test named `formats_500_json_dump` `:654` |
| 10 | "completion as `Worked for 2.3s`" | ✅ `blocks/session_event.rs:375-379` |
| 10 | "cost hidden below $0.005" | ✅ `views/status_line/segments.rs:18` `MIN_DISPLAYED_COST_USD = 0.005` |
| 10 | "a successful compaction deliberately invisible" | ❌ **stronger than the tree supports** — a successful compaction *is* rendered: `Context compacted: A → B tokens` (`session_event.rs:425-439`, tests `:1037-1066`). What verifies is *one line per outcome* (`session_notification.rs:1660`). Corrected in § 10/§ 11 |
| 11-i | `session_event.rs:375` period-less status copy | ✅ exact comment; nuance: `"Turn completed."` keeps a period for the no-elapsed variant (`:381`) |
| 11-ii | `notifications/title.rs:18` no animation that reads as broken | ✅ exact ("calm 1s blink cycle that reads as intentional rather than broken flickering") |
| 11-iii | `appearance/config.rs:113` never recolor borders on selection | ✅ (`highlight_overlays_border` doc: inset so "the borders remain uncolored"); same corrected path as #7 |
| 11-iv | `glyphs.rs:1-7` legacy ASCII fallbacks | ✅ (`xai-grok-pager-render/src/glyphs.rs`, `prompt_arrow()` `:15-22`) |

**Emile-side facts** were read from the working tree at the same commit set
(`src/ui/theme.js:24-37`, `src/ui/tool-lines.js:100-142`,
`src/ui/response.js:59-96`, `src/ui/thinking.js:104-330`,
`src/ui/user-message.js:39-41`, `src/ui/status-bar.js:42-59`,
`src/ui/spinner.js:11-79`, `src/ui/prompt-input-persistent.js:369-395`,
`src/ui/diff-block.js:32-77`, `src/ui/markdown.js:13-88`,
`src/api/transports/base.js:90-160`, `src/agent/agent.js:329-696`,
`src/config.js:225`, `docs/visual-identity.md` § 1–6) and the free-key set was
verified by scanning every `key.ctrl` comparison in `src/`
(`Ctrl+E/F/G/H/.` free; `Ctrl+C/P/T/U/D` reserved).