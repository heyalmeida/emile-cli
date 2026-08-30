# Tasks: Terminal UI premium pass (minimal, Claude-Code-grade)

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-25-tui-premium` |

---

## Phase 0 — Preparation

- [x] T0.1 — Read relevant documentation (visual identity, pass-1 spec, ui-premium analysis)
- [x] T0.2 — Spec and plan `approved`
- [x] T0.3 — Risk classified (Medium — rendering + default-behavior change); gates confirmed
- [x] T0.4 — Feature branch: continue on `feat/tui-overhaul` (same feature, pass 1 unmerged)

## Phase 1 — Implementation

- [x] T1.1 — Commit spec/plan/tasks and fold `ui-premium.md` into the spec directory
- [x] T1.2 — Palette: `C.gold` (#FFD700) and `C.ghost` (#3B4261) tokens; grep/find tone → gold; `GAP` constants *(verifies AC-01 partially)*
- [x] T1.3 — Tool lines: `printToolSummary` box → grid-aligned single lines with lowercase labels and truncated dim args *(verifies AC-01)*
- [x] T1.4 — Status: remove `printToolsDone`; `↳ N tools` dim header in `printAssistantResponse` with module counter *(verifies AC-02)*
- [x] T1.5 — Thinking: ghost one-liner collapsed by default, muted content on expanded; toggle sites updated *(verifies AC-03, AC-04)*
- [x] T1.6 — User message divider + response box max width 88 *(verifies AC-05, AC-06)*
- [x] T1.7 — Harness update

## Phase 2 — Testing, Security and Verification

- [x] T2.1 — Harness run at 80 and 60 columns; both thinking modes; no wraps, no ANSI leak
- [x] T2.2 — `node --check` on `src/ui.js`, `src/agent.js`, `src/cli.js`, `test-ui.js`
- [x] T2.3 — No new dependencies — `npm audit` not applicable
- [x] T2.4 — All acceptance criteria verified (log below)

## Phase 3 — Documentation and Closing

- [x] T3.1 — Sync `docs/visual-identity.md` (tool lines, ghost thinking, divider, 88-col box, gold token, collapsed default)
- [x] T3.2 — Update `features/terminal-ui.md` (change history)
- [x] T3.3 — `CHANGELOG.md` entry
- [x] T3.4 — Update `docs/roadmap.md` and README (thinking default)
- [x] T3.5 — Spec status → `implemented`
- [x] T3.6 — Commit docs sync on `feat/tui-overhaul`
- [x] T3.7 — Handoff notes

---

## Acceptance Criteria Verification Log

| AC | Status | Evidence (how it was verified) |
|----|--------|--------------------------------|
| AC-01 | ✅ | Harness at 80/60 cols: `● read  `, `● exec  ` grid-aligned, tone colors on bullet+label, args truncated with `…`, no box |
| AC-02 | ✅ | Harness: `↳ 5 tools` dim line above the box; `grep -r "tools completed" src/` → no matches |
| AC-03 | ✅ | Harness collapsed mode: `··· thinking` → `··· thought 2s` ghost line only; no warn color, no content |
| AC-04 | ✅ | Both toggle sites (`cli.js` /thinking, `ui.js` Ctrl+P) use `=== true` semantics; toggle message reports mode correctly |
| AC-05 | ✅ | Harness: `── Add input validation to src/api.js ────…` divider with fg text + muted dashes |
| AC-06 | ✅ | Harness at 120-col terminal: box stays 88 wide; padding rows + bold accent label present |
| AC-07 | ✅ | Harness at 80/60 cols: no wrapped lines, ANSI-reset scan clean |
| AC-08 | ✅ | `node --check` on all 4 files → OK |

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| f405d4f | docs(spec): add tui-premium pass 2 spec | specs/2026-08-25-tui-premium/* |
| ea71f56 | feat(ui): premium minimal pass — tool lines, ghost thinking, divider | src/ui.js, src/agent.js, src/cli.js |
| 6486e6e | test(ui): update harness for premium pass | test-ui.js |
| — | docs: sync visual identity, roadmap, changelog, feature registry | docs/, features/, CHANGELOG.md, README.md, specs/ |

## Handoff Notes

- Thinking is now **collapsed by default** — expanded mode is opt-in via `/thinking` or Ctrl+P. Documented in CHANGELOG and README.
- The pass-1 tools box (RF-S03 of `2026-08-25-tui-overhaul`) is superseded by the grid-aligned tool lines; the direction change is recorded in this spec § 7.
- The source analysis's 256-color palette was adapted to the existing true-color `C` system (one palette, one source of truth) — `gold`=#FFD700, `ghost`=#3B4261.
- The `↳ N tools` counter is display-only and resets on each user message; a turn ending in tool calls without a text reply simply doesn't print the summary.
