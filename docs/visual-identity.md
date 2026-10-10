# Emile — Visual Identity (TUI Design System)

> **Status:** 🟢 Current · **Source of truth for terminal UI.**
> Every change that renders something to the terminal (color, box, layout, spinner, prompt, spacing) starts in this document. The implementation lives in the centralized `src/ui/` module tree.

---

## 1. Principles

1. **One palette, one source of truth.** All colors come from the `C` palette exported by `src/ui/index.js`. No module calls picocolors directly for user output.
2. **Respect the user's terminal.** Widths computed by `getW()` with a 60-column minimum; graceful fallback on terminals without true-color.
3. **Hierarchy by color, not by shouting.** Primary information in `fg`/`accent`; metadata in `muted`/`dim`; only errors use `red`.
4. **Motion with purpose.** Spinner and streaming exist to report progress; decorative animation doesn't get in.
5. **State always visible.** The user should never wonder "is it stuck or thinking?" — every waiting state has feedback (spinner, thinking stream, status bar and terminal-tab title).
6. **Zero ANSI leakage.** No escape code may remain in exported output or files (`/export`).

---

## 2. Palette — Tokyo Night

Defined in `src/ui/theme.js` and exported by `src/ui/index.js` (true-color with a picocolors fallback when the terminal doesn't support it).

| Token | Hex | Semantic use |
|-------|-----|---------------|
| `C.accent` | `#7AA2F7` (blue) | Primary highlight, titles, focus |
| `C.purple` | `#BB9AF7` (purple) | Brand identity (header), magical elements |
| `C.gold` | `#FFD700` (gold) | Search operations (grep/find) |
| `C.info` | `#7DCFFF` (cyan) | Passive information, reads, statistics |
| `C.success` | `#9ECE6A` (green) | Success, confirmation, `on` states |
| `C.warn` | `#E0AF68` (amber) | Warning, state mutation (write/edit), risk confirmation |
| `C.red` | `#F7768E` (red) | Error, failure, command execution (side effects) |
| `C.fg` | `#A9B1D6` (grayish blue) | Main content text, listing tools |
| `C.muted` | `#565F89` (gray) | Box borders, metadata, footers, dividers |
| `C.ghost` | `#3B4261` (dark gray) | **Reserved**: decorative marks inside an already-visible line — never text the user must read (see the DIM rule below) |
| `C.dim` | (ANSI dim) | The dimmest de-emphasis step: punctuation, counts, collapsed reasoning |

### Semantic roles — `ROLE`

`C` answers *which color*; `ROLE` (also in `src/ui/theme.js`) answers *what this
line is*. Components should name a **role**, not a hue: that is what lets the
palette be retuned without re-deciding meaning at every call site (references:
`theme/mod.rs:1` "all colors come from the `Theme` struct", `theme/tokyonight.rs:56-64`).
**Every role is an alias into `C`** — it must never define a value of its own
(`test/token-roles.test.js` asserts this member by member).

| Role | Token | Meaning |
|------|-------|---------|
| `ROLE.user` | `fg` | the user's own words (message divider text) |
| `ROLE.agent` | `accent` | the agent's identity label |
| `ROLE.thinking` | `muted` | reasoning header + body |
| `ROLE.tool.passive` | `info` | read / recall / fetch — informational |
| `ROLE.tool.mutate` | `warn` | write / edit / memory proposal — changes state |
| `ROLE.tool.danger` | `red` | shell execution — side effects |
| `ROLE.tool.search` | `gold` | grep / find / web search |
| `ROLE.tool.plain` | `fg` | listing — low impact |
| `ROLE.tool.workflow` | `accent` | plan / task / MCP / unknown |
| `ROLE.success` / `ROLE.warn` / `ROLE.running` / `ROLE.error` | `success` / `warn` / `warn` / `red` | **states**: a state color reports a state |
| `ROLE.diff.{insert,delete,context}` | `success` / `red` / `muted` | diff lines |
| `ROLE.meta.punct` | `dim` | the dimmest step: counts, elision markers, `(+N chars)`, `↳ N tools` |
| `ROLE.meta.label` | `muted` | the middle step: labels, footers, separators, args context, metrics, borders |
| `ROLE.border.{box,focused}` | `muted` / `accent` | box chrome, and the focused element inside it |

**Usage rules:**

- Red is exclusive to errors. Confirmation warnings use `warn`.
- A single output line uses at most 2 colors besides `fg`/`muted`.
- Box borders are always `muted` (`ROLE.border.box`); a box label may use `accent` when it's an active element.
- **De-emphasis is chosen by FUNCTION, not by darkness** (reference
  `theme/tokyonight.rs:70-74`): punctuation and counts take `ROLE.meta.punct`
  (SGR DIM); labels, footers, args and borders take `ROLE.meta.label`.
- **Tertiary text de-emphasizes with the DIM attribute** (`ROLE.meta.punct`, SGR 2)
  on the terminal's own foreground — never with a hardcoded near-background gray.
  Many dark profiles set their dark slots very close to the background, so such
  text disappears entirely (reference `theme/terminal_default.rs:12-18`:
  *"Do not paint body or status text as `DarkGray`"*). `C.ghost` is **reserved for
  decorative marks inside an already-visible line** and must never carry text the
  user has to read.
- **A state color reports a state, never a metric.** `cache hit: 87%` is a label
  (`ROLE.meta.label`), not a success; `tasks: 4/4` complete IS a success.
- **One palette, one source.** No module outside `src/ui/theme.js` may declare a
  color helper or a truecolor literal — enforced by lint over `src/ui/**`
  (`no-restricted-syntax`).

---

## 3. Components

| Component | Where | Description |
|------------|------|-----------|
| **Startup screen** | `printStartupScreen` | Brand header in the open-box style: `╭─ ✦ emile ─ v ───` / tagline / `╰────` |
| **Command divider** | `printUserMessage` | User message as the chapter marker: `── <message> ────` (fg text, muted dashes, truncated); resets the turn's tool counter |
| **Open boxes** | `boxTopOpen`/`boxBottomOpen` | **Top and bottom borders only** — no left/right rails. Content indents 4 spaces (`BOX_INDENT`). Border ANSI parts are composed separately: never nest a styled label inside `C.muted(...)` or the label's RESET kills the border color |
| **Input prompt** | `persistentPromptInput` / `buildPromptLayout` | Persistent boxed writing field shared by idle and active turns, with slash-command autocomplete, ↑/↓ menu navigation and multiline editing via `Shift+Enter`; one blank line above the block. The pure layout clips every physical row, preserves a trailing ANSI reset and keeps the cursor within the exact wrapped row. `❯` is reserved for the real input row; the selected autocomplete item uses `●`. Tab accepts that match (or toggles Plans mode without one), while async owners transfer stdin exclusively. A paste repaints the block **once** (bracketed payload, or a burst of ≥3 text keypresses within 2 ms on terminals without bracketed paste) and no cursor-up exceeds the viewport height or is emitted on a non-TTY stdout. The block is **budgeted by the terminal** (`stdout.rows - 1`, recomputed per render) and a draft that does not fit is windowed around the cursor — the drawn frame can always reach its own top, so a stale frame cannot survive. Erase + block + caret are one write wrapped in DEC 2026 synchronized output |
| **Model picker** | `promptModelPicker` | Incremental search surface for `/model`: query line, at most seven result rows, accent focus marker, muted metadata/help, ↑/↓ navigation, Enter selection and Esc cancellation; labels are bounded and sanitized before rendering |
| **Thinking stream** | `startThinkingStream` etc. | **Expanded by default**: live muted text whose header finishes as `Thought for Ns`; each redraw is assembled into one terminal write. Collapsed via `/thinking`/Ctrl+P: a dim one-liner (`··· thinking` → `··· thought Ns`, `ROLE.meta.punct` — DIM on the terminal's own foreground, never a near-background gray, so the only signal that reasoning happened survives every profile) |
| **Reasoning block** | `printThinking` | Uses the same state as the thinking stream: expanded (`/thinking`/Ctrl+P) shows `✻ Thought for Ns` (`ROLE.thinking`) + full muted content; collapsed shows the dim one-liner |
| **Tool lines** | `printToolSummary` | Grid-aligned rows (no box): `● <label 8ch> <dim arg>`; multiline arguments keep continuation lines under the argument column; bullet+label carry the semantic **role** of the operation (`ROLE.tool.*` — the tone vocabulary is `passive/mutate/danger/search/plain/workflow`, never a hue) and each physical line remains bounded/sanitized |
| **Tools header** | `printAssistantResponse` | Single dim `↳ N tools` line above the response box — the only status line of a turn |
| **Diff block** | `printDiffBlock` | Open box: `┌─ file ───` / `NNNN + line` rows with add/remove colors and truncation / `└────` |
| **Spinner** | `src/spinner.js` | Braille, dependency-free; stops silently on success (no noise line) |
| **Turn keys** | `listenTurnKeys` | Exclusive key listener active while the idle prompt is suspended and the agent works. It renders the same full frame, temporarily routes stdout above it, and leaves the real cursor at the queue draft caret. Esc/Ctrl+C cancel only the turn; Tab/↑/↓ keep slash autocomplete usable; Enter queues bounded/sanitized input. Cleanup erases the frame, restores the previous stdout writer/raw state and returns ownership to the idle prompt |
| **Plan status** | `renderPlanStatus` | Plan state in plans mode |
| **Rules inspection** | `printRulesInfo` | Read-only `/rules` view; inactive state teaches the user to create their own `.emilerules`; file content has ANSI/OSC controls removed before rendering |
| **Global memory panels** | `printMemoryStatus` / `printMemoryRecords` / `printMemoryDoctor` | Open-box status/list/doctor surfaces. Status shows only mode, session pause, counts, health and revision; content appears only after an explicit list/show/forget preview. Every dynamic field is control-stripped and lists are capped at 50 displayed records |
| **Web-search toggle** | `handleWebSearch` | `/websearch` prints a compact enabled/disabled state; enabling prints an amber warning that provider charges may apply, including on free model routes; unsupported providers fail closed |
| **Terminal window title** | `configureTerminalTitle` / `setTerminalActivity` | Activity-first OSC title: `<activity> · emile · <workspace> · <model>`. States come from the CLI/agent loop (`starting`, `connecting MCP`, `waiting`, `thinking`, `responding`, compression and allowlisted tool descriptions); unsupported terminals get no output |
| **Status bar / footer** | — | Context (tokens), model and estimated cost, optional `MCP: <server>` token and — in plans mode — `tasks: X/Y` (warn while incomplete, success when complete) read live from `task.md`. Every metric is `ROLE.meta.label` — a cache-hit rate is information, not a success state |

**Semantic tool colors** (tool lines):

| Operation | Tone | Reason |
|-----------|------|--------|
| `read` | `info` (cyan) | Passive, informational |
| `write` / `edit` | `warn` (amber) | Mutates state |
| `exec` | `red` | Potential side effects |
| `grep` / `find` | `gold` | Search |
| `list` | `fg` | Listing, low impact |
| `memory` proposal | `warn` | Candidate may mutate global state after validation |
| `recall` memory | `info` | Read-only lower-priority lookup |
| Plan tools / MCP / unknown | `accent` | Workflow operations |

**Spacing constants:** `GAP.none` (same group), `GAP.section` (one blank line — between groups), `GAP.command` (between user commands) are exported from `src/ui/index.js`; new components must use them instead of scattered `\n\n`.

**Layout specifications:**

- Usable width: `getW()` = `max(columns - 4, 60)`; boxes with a 2-space indent.
- **Shared measure:** full-width blocks (response box, command divider) use `MAX_BOX_W = 120` (`min(columns - 4, MAX_BOX_W)`).
- **Open boxes (mandatory):** every box renders **top and bottom borders only** (`╭─ label ───` / `╰────`) — no left/right `│` rails. Right-padding math is forbidden: it relies on `stripAnsi().length`, which is not the display width for wide/emoji characters and produces misaligned edges.
- **Elision markers (new vocabulary — viewport-budgeted blocks):** when a block cannot show all of its rows inside the terminal, the hidden rows are reported instead of silently dropped: `⌃ N earlier rows` above the visible window and `⌄ N later rows` below it, in `C.dim`, at the block's two-space gutter, one row per side, and each marker is omitted when its count is zero. Today they are the prompt writing field's window markers (`buildPromptLayout({ maxRows })`); the same glyph pair is the vocabulary for any future budgeted block, and the visible window always contains the focused/cursor row. The point of the budget is structural: the drawn block never exceeds `stdout.rows - 1` rows, so the erase always reaches its own top.
- Box content indents 4 spaces under the top border (`BOX_INDENT`); the response box additionally has a blank inner row above and below the text.
- **Border color rule:** compose ANSI parts separately (`muted('╭─') + styledLabel + muted(fill)`); never nest a styled label inside `C.muted(...)` — the label's trailing RESET kills the muted color for the rest of the border (the "white top border" bug).
- **Vertical rhythm (mandatory):** exactly **1 blank line between every distinct block** (user message, thinking, assistant box, tool lines, diff box, session bar, prompt) and **0 blank lines between items of the same group** (consecutive tool rows). Each block owns one *leading* gap and never prints *trailing* blanks — adjacent blocks therefore always have exactly one gap between them.
- Sanitization: assistant output goes through its interceptor; user-controlled file content rendered directly by the CLI goes through `stripTerminalControls` to remove ANSI/OSC/DCS sequences and control bytes. The window title applies the same control stripping, whitespace normalization and a 100-character cap; prompts and raw command/search arguments are excluded entirely.
- High-risk shell confirmations retain the same clack prompt surface but use a dedicated warning message for network-to-shell pipelines, including the sanitized command preview and the reason for the extra friction.
- MCP tool summaries use the compact `[mcp:server] tool` identity so third-party execution is visually distinct from built-in tools without exposing tool arguments.
- First MCP connections use the existing fail-closed `confirm` surface and show only server name, transport, sanitized endpoint and configured tool names; reconnect and transport failures use the amber warning surface without credentials.
- Memory panels use `min(columns - 4, 76)` with a 20-column defensive floor, so 60/79/80/120-column terminals stay bounded. Exact-ID forget is immediate; query forget, sensitive remember, export and clear use the existing fail-closed confirmation surface. Tool summaries never render proposed evidence, recall queries or recalled content.

---

## 4. Interaction

| Element | Pattern |
|----------|--------|
| Autocomplete | `Tab` accepts the suggestion; ↑/↓ navigate |
| Model search | Type any substring to filter model id/label case-insensitively; at most seven results remain visible |
| Web search | `/websearch` toggles only for OpenRouter and displays the cost warning when enabled |
| Global memory | `/memory` inspects state; ambiguous forget, sensitive remember, export and clear use `confirm` defaulting to no; `/memory pause` and `/memory resume` are session-local |
| Model selection | `↑/↓` changes focus; `Enter` chooses; `Esc` or `Ctrl+C` cancels without changing config |
| Multiline prompt | `Shift+Enter` inserts a newline at the cursor; plain `Enter` submits |
| Cancel draft | `Esc` clears without sending |
| Exit | `Ctrl+C` immediately; `exit` quits with MCP shutdown |
| Paste | Bracketed-paste payloads remain editable, including embedded newlines; `Enter` sends the draft |
| Tall draft | The writing field is budgeted by the terminal: the caret row always stays visible and the hidden rows are reported with the dim `⌃ N earlier rows` / `⌄ N later rows` markers |
| Risk confirmation | @clack `confirm` defaulting to **no** (fail-closed) |
| Plans | `Tab` toggles plans mode at the prompt |

---

## 5. Known UI Debt (visual backlog)

> Known items that **violate** the principles above or hurt the experience. Feeding this section is mandatory when new problems are detected; resolving them happens via specs (`2026-08-25-tui-overhaul` pass 1, `2026-08-25-tui-premium` pass 2).

**Resolved in pass 1:** missing gaps between blocks, tool calls without visual grouping, single-color tool labels, `✓ response received` noise, thinking rendered with primary-content weight, assistant box without inner padding, `off` rendered in red, legacy `pc.*` remap in `cli.js`.

**Resolved in pass 2 (premium):** tool-call box borders (now grid-aligned lines), `✓ N tools completed` footer (now a dim `↳ N tools` header), thinking too visible (now ghost on collapse; expanded by default with opt-out), tool label columns unaligned, full-width response box (now 88-col measure), missing command divider for user messages.

**Resolved in pass 3 (open boxes):** chronically misaligned right box borders (side rails removed entirely — no right-padding math), white top border on the response box (ANSI parts now composed separately).

**Still open:**

- Long waiting states (chained tools) rely on the generic spinner; structured per-step progress is missing.
- No dedicated visual treatment for API error/model fallback (flat message).
- Interactive selects lack radio-style active/inactive treatment (bold + accent for the cursor item).
- `/cost` and stats render as a loose text list, outside the box pattern of the rest of the UI.
- Narrow widths (<80 cols) verified for pass 1/2 blocks only — a systematic audit of every component is still pending.

---

## 6. Visual Review Checklist

Before closing any UI change:

- [ ] Used only `C`/`ROLE` tokens (no hardcoded colors outside the palette, no local color helper)?
- [ ] Named a **role** (`ROLE.*`) instead of a hue, and picked the de-emphasis step **by function** (punct vs label)?
- [ ] Any state color (`success`/`warn`/`error`) actually reports a state, not a metric?
- [ ] Nothing the user must read is rendered in `C.ghost` or another near-background gray?
- [ ] Works at 60/80/120+ columns?
- [ ] Waiting state has feedback? Error uses `red` and success uses `success`?
- [ ] Correct ANSI reset (no color leaking into the next line)?
- [ ] Keyboard interaction documented in the README if new?
- [ ] Terminal-title changes verified in TTY and no-op non-TTY/`TERM=dumb` paths, with no prompt/argument leakage?
- [ ] Before/after screenshot or record attached to the spec (when applicable)?
