# Spec & Plan: Prompt multiline rendering fix + response box width

| Field | Value |
|-------|-------|
| **ID** | `2026-08-25-prompt-multiline-fix` |
| **Status** | `implemented` |
| **Phase/Context** | Phase 1 — UI Overhaul — **Pass 4** (bug fix on passes 1-3) · Branch: `feat/tui-overhaul` |

---

## 1. Problem / Motivation

Two user-reported defects:

1. **Prompt multiline corruption:** when the input wraps to the next line, the display fills with garbage/duplicated lines; deleting text doesn't visually update even though the input state is correct.
2. **Response box too narrow:** the 88-column measure from pass 2 is too small for real code discussions.

## 2. Root causes

1. The writing field was drawn as **a single write** (`styledPrompt + input`) containing embedded newlines and letting the terminal auto-wrap long text — while the redraw math counted rows with `wrapText()` at different widths (`columns - promptLength` for counting vs. full `columns` terminal auto-wrap). Drawn height ≠ counted height → the cursor-up erase missed/overlapped lines → duplicated/garbage rows accumulated on every keystroke.
2. `cursorCol` could exceed the row width (`promptLength + cursor` up to `input.length`): the `\x1B[NC` moved the cursor past the end of the line, wrapping it onto the next row and shifting every subsequent redraw by one line.
3. Response box measure: `Math.min(cols - 4, 88)` too narrow.

## 3. Fix

| ID | Change | File |
|----|--------|------|
| RF-S01 | Writing field drawn as **one explicit `\r\x1B[K` write per wrapped row** (each row ≤ terminal width — the terminal must never auto-wrap); continuation rows indent under the prompt glyph; drawn height always equals counted height | `src/ui.js` |
| RF-S02 | Cursor row/column computed by walking the rendered rows with per-row capacity tracking (`plain.length + 1` boundary); column clamped to `[promptLength, columns - 1]` | `src/ui.js` |
| RF-S03 | Submitted message echoes as the command divider (`printUserMessage`) instead of the legacy `❯ message`; Ctrl+C exits silently (no echo) | `src/ui.js` |
| RF-S04 | Response box and command divider share `MAX_BOX_W = 120` (was 88) | `src/ui.js` |

## 4. Verification

Virtual-terminal simulator (temporary script, not committed): interprets every ANSI sequence the prompt writes into a screen model, then:

- Types 200 chars at 80 columns (multi-row wrap): ✅ exactly one `❯`, no duplicated borders, all text visible, no line exceeds 80 columns
- Backspaces everything: ✅ text fully erased from screen, one empty prompt row remains, zero garbage rows

Plus: `node --check` on touched files; render harness unchanged behavior elsewhere.

## 5. Out of Scope

- Arrow-key cursor movement across wrapped rows (left/right still move by characters; visual cursor may drift a few columns inside heavily-wrapped rows with trimmed spaces)
- Automated test suite (Phase 2 of the roadmap)

## Acceptance Criteria Log

| AC | Status | Evidence |
|----|--------|----------|
| AC-01 wrap keeps one prompt block | ✅ | Simulator T1: 1 prompt glyph, ≤2 border lines, all 40 words visible, no line > 80 cols |
| AC-02 delete updates the screen | ✅ | Simulator T2: zero leftover text rows after 200 backspaces |
| AC-03 no garbage rows | ✅ | Simulator T2: nonEmpty check = 0 unexpected rows |
| AC-04 wider response box | ✅ | Harness renders box at `min(cols - 4, 120)`; divider shares the measure |
| AC-05 syntax gates | ✅ | `node --check src/ui.js src/cli.js test-ui.js` → OK |
