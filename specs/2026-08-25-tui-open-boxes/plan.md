# Plan & Tasks: Open boxes (Pass 3)

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-25-tui-open-boxes` · **Status:** approved → implemented |
| **Branch** | `feat/tui-overhaul` (continues the terminal-UI feature) |

## Plan (summary)

Rewrite the five box components in `src/ui.js` to the open style, replacing the `boxTop/boxRow/boxBottom` helpers with open-box helpers that compose ANSI parts separately (fixes the RESET-kills-muted bug):

- **Response box** (`printAssistantResponse`): `╭─ emile ───` (accent label between muted parts) / content indented 4 spaces, wrapped to `boxW - 4` / `╰────`; inner blank padding lines kept as plain empty lines.
- **Config box** (`printConfigBox`): `┌─ Configuration ───` / rows `    key    value` (padEnd alignment preserved, no right pad) / `└────`.
- **Help box** (`printHelp`): same open style.
- **Diff box** (`printDiffBlock`): `┌─ file ───` / rows `    NNNN + line` with colors and truncation / `└────`; drop the outer `│` gutters.
- **Startup/header** (`printStartupScreen`/`printHeader`): `╭─ ✦ emile ─ v ───` / tagline row / `╰────`.
- **Markdown code rail**: `│ ` prefix aligned under the 4-space content indent.

## Tasks

- [x] T0 — Spec approved; branch confirmed (`feat/tui-overhaul`)
- [x] T1 — Open-box helpers + response box *(AC-01, AC-02, AC-03)*
- [x] T2 — Config box + help box + startup/header *(AC-01)*
- [x] T3 — Diff box open style *(AC-05)*
- [x] T4 — Markdown code rail alignment *(AC-04)*
- [x] T5 — Harness updated + verification at 80/60 cols; `node --check` all files *(AC-04, AC-06)*
- [x] T6 — Docs sync (visual identity, changelog, feature registry, roadmap) + spec `implemented`

## Acceptance Criteria Verification Log

| AC | Status | Evidence |
|----|--------|----------|
| AC-01 | ✅ | `grep -c '│' src/ui.js` → only the markdown code rail (not a box frame); harness shows no side borders on any box |
| AC-02 | ✅ | Harness: dashes after the `emile` label render muted (parts composed separately — no nested ANSI) |
| AC-03 | ✅ | No right border exists; content wraps at `boxW - 4` |
| AC-04 | ✅ | Harness at 80/60 cols: borders fit, 4-space indent on every content line |
| AC-05 | ✅ | Harness diff block: line numbers + red/green markers, long line truncated with `…` |
| AC-06 | ✅ | `node --check` on `src/ui.js`, `src/cli.js`, `test-ui.js` → OK |

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| 7294a6d | docs(spec): add tui-open-boxes pass 3 spec | specs/2026-08-25-tui-open-boxes/* |
| 4d3f9e6 | fix(ui): open boxes — remove side borders, fix top-border color | src/ui.js, test-ui.js |
| — | docs: sync visual identity, changelog and feature registry | docs/, features/, CHANGELOG.md, specs/ |
