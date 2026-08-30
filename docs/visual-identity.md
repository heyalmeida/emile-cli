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
| `C.ghost` | `#3B4261` (dark gray) | Thinking block — near-invisible by design |
| `C.dim` | (ANSI dim) | Secondary text (tool args, status headers) |

**Usage rules:**

- Red is exclusive to errors. Confirmation warnings use `warn`.
- A single output line uses at most 2 colors besides `fg`/`muted`.
- Box borders are always `muted`; a box label may use `accent` when it's an active element.

---

## 3. Components

| Component | Where | Description |
|------------|------|-----------|
| **Startup screen** | `printStartupScreen` | Brand header in the open-box style: `╭─ ✦ emile ─ v ───` / tagline / `╰────` |
| **Command divider** | `printUserMessage` | User message as the chapter marker: `── <message> ────` (fg text, muted dashes, truncated); resets the turn's tool counter |
| **Open boxes** | `boxTopOpen`/`boxBottomOpen` | **Top and bottom borders only** — no left/right rails. Content indents 4 spaces (`BOX_INDENT`). Border ANSI parts are composed separately: never nest a styled label inside `C.muted(...)` or the label's RESET kills the border color |
| **Input prompt** | `promptInput` | Boxed writing field with slash-command autocomplete, ↑/↓ history; one blank line above the block. **The field draws one explicit row per wrapped line** (each row ≤ terminal width — the terminal must never auto-wrap, or the redraw math corrupts the screen); cursor column is always clamped within its row |
| **Model picker** | `promptModelPicker` | Incremental search surface for `/model`: query line, at most seven result rows, accent focus marker, muted metadata/help, ↑/↓ navigation, Enter selection and Esc cancellation; labels are bounded and sanitized before rendering |
| **Thinking stream** | `startThinkingStream` etc. | **Expanded by default**: live muted text whose header finishes as `Thought for Ns`. Collapsed via `/thinking`/Ctrl+P: ghost one-liner (`··· thinking` → `··· thought Ns`, `C.ghost`) |
| **Reasoning block** | `printThinking` | Uses the same state as the thinking stream: expanded (`/thinking`/Ctrl+P) shows `✻ Thought for Ns` + full muted content; collapsed shows the ghost one-liner |
| **Tool lines** | `printToolSummary` | Grid-aligned single lines (no box): `● <label 8ch> <dim arg>`; bullet+label carry the semantic tone of the operation (table below); args truncated to the terminal width |
| **Tools header** | `printAssistantResponse` | Single dim `↳ N tools` line above the response box — the only status line of a turn |
| **Diff block** | `printDiffBlock` | Open box: `┌─ file ───` / `NNNN + line` rows with add/remove colors and truncation / `└────` |
| **Spinner** | `src/spinner.js` | Braille, dependency-free; stops silently on success (no noise line) |
| **Plan status** | `renderPlanStatus` | Plan state in plans mode |
| **Rules inspection** | `printRulesInfo` | Read-only `/rules` view; inactive state teaches the user to create their own `.emilerules`; file content has ANSI/OSC controls removed before rendering |
| **Terminal window title** | `configureTerminalTitle` / `setTerminalActivity` | Activity-first OSC title: `<activity> · emile · <workspace> · <model>`. States come from the CLI/agent loop (`starting`, `connecting MCP`, `waiting`, `thinking`, `responding`, compression and allowlisted tool descriptions); unsupported terminals get no output |
| **Status bar / footer** | — | Context (tokens), model and estimated cost |

**Semantic tool colors** (tool lines):

| Operation | Tone | Reason |
|-----------|------|--------|
| `read` | `info` (cyan) | Passive, informational |
| `write` / `edit` | `warn` (amber) | Mutates state |
| `exec` | `red` | Potential side effects |
| `grep` / `find` | `gold` | Search |
| `list` | `fg` | Listing, low impact |
| Plan tools / MCP / unknown | `accent` | Workflow operations |

**Spacing constants:** `GAP.none` (same group), `GAP.section` (one blank line — between groups), `GAP.command` (between user commands) are exported from `src/ui/index.js`; new components must use them instead of scattered `\n\n`.

**Layout specifications:**

- Usable width: `getW()` = `max(columns - 4, 60)`; boxes with a 2-space indent.
- **Shared measure:** full-width blocks (response box, command divider) use `MAX_BOX_W = 120` (`min(columns - 4, MAX_BOX_W)`).
- **Open boxes (mandatory):** every box renders **top and bottom borders only** (`╭─ label ───` / `╰────`) — no left/right `│` rails. Right-padding math is forbidden: it relies on `stripAnsi().length`, which is not the display width for wide/emoji characters and produces misaligned edges.
- Box content indents 4 spaces under the top border (`BOX_INDENT`); the response box additionally has a blank inner row above and below the text.
- **Border color rule:** compose ANSI parts separately (`muted('╭─') + styledLabel + muted(fill)`); never nest a styled label inside `C.muted(...)` — the label's trailing RESET kills the muted color for the rest of the border (the "white top border" bug).
- **Vertical rhythm (mandatory):** exactly **1 blank line between every distinct block** (user message, thinking, assistant box, tool lines, diff box, session bar, prompt) and **0 blank lines between items of the same group** (consecutive tool rows). Each block owns one *leading* gap and never prints *trailing* blanks — adjacent blocks therefore always have exactly one gap between them.
- Sanitization: assistant output goes through its interceptor; user-controlled file content rendered directly by the CLI goes through `stripTerminalControls` to remove ANSI/OSC/DCS sequences and control bytes. The window title applies the same control stripping, whitespace normalization and a 100-character cap; prompts and raw command/search arguments are excluded entirely.
- High-risk shell confirmations retain the same clack prompt surface but use a dedicated warning message for network-to-shell pipelines, including the sanitized command preview and the reason for the extra friction.
- MCP tool summaries use the compact `[mcp:server] tool` identity so third-party execution is visually distinct from built-in tools without exposing tool arguments.
- First MCP connections use the existing fail-closed `confirm` surface and show only server name, transport, sanitized endpoint and configured tool names; reconnect and transport failures use the amber warning surface without credentials.

---

## 4. Interaction

| Element | Pattern |
|----------|--------|
| Autocomplete | `Tab` accepts the suggestion; ↑/↓ navigate |
| Model search | Type any substring to filter model id/label case-insensitively; at most seven results remain visible |
| Model selection | `↑/↓` changes focus; `Enter` chooses; `Esc` or `Ctrl+C` cancels without changing config |
| Cancel draft | `Esc` clears without sending |
| Exit | `Ctrl+C` immediately; `exit` quits with MCP shutdown |
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

- [ ] Used only `C` tokens (no hardcoded colors outside the palette)?
- [ ] Works at 60/80/120+ columns?
- [ ] Waiting state has feedback? Error uses `red` and success uses `success`?
- [ ] Correct ANSI reset (no color leaking into the next line)?
- [ ] Keyboard interaction documented in the README if new?
- [ ] Terminal-title changes verified in TTY and no-op non-TTY/`TERM=dumb` paths, with no prompt/argument leakage?
- [ ] Before/after screenshot or record attached to the spec (when applicable)?
