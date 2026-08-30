# Tasks: Terminal UI overhaul — Pass 1 (Spacing, Rhythm and Readability)

| Field | Value |
|-------|-------|
| **Spec** | `2026-08-25-tui-overhaul` |

---

## Phase 0 — Preparation

- [x] T0.1 — Read relevant documentation (PRD, architecture, visual identity, ADRs) — *Rule 1 of `.clinerules`*
- [x] T0.2 — Confirm this spec and plan are `approved`
- [x] T0.3 — Classify risk (Medium — rendering layer + thinking-stream cursor math), map surfaces and confirm gates
- [x] T0.4 — Create/switch to the feature branch `feat/tui-overhaul` — *Rule 8 of `.clinerules`*

## Phase 1 — Implementation

- [x] T1.1 — Commit spec/plan/tasks and fold `ui-improvements.md` into the spec directory
- [x] T1.2 — Rhythm: blank line after response box, gap before `✓ N tools completed`, gap after thinking (both modes), gap before prompt block, blank rows inside response box + bold accent label, config `off` dim *(verifies AC-02, AC-06, AC-07, AC-08, AC-09)*
- [x] T1.3 — Tool box: `printToolSummary` renders rows inside `╭─ tools ─╮` box; semantic color per tool via `tone` in `formatToolSummary`; arg truncation *(verifies AC-03, AC-04)*
- [x] T1.4 — Thinking demoted to `muted` (header + content, expanded and compact); silent spinner stop in `agent.js` *(verifies AC-05, AC-06)*
- [x] T1.5 — Remove `pc` remap in `cli.js` → `C.*` everywhere *(verifies AC-01)*
- [x] T1.6 — Extend `test-ui.js` harness with a full simulated turn

## Phase 2 — Testing, Security and Verification

- [x] T2.1 — Harness run: full turn render at 80 and 60 columns; no box wraps, no ANSI leak
- [x] T2.2 — `node --check` on `src/ui.js`, `src/agent.js`, `src/cli.js`, `test-ui.js` — all pass
- [x] T2.3 — No new dependencies — `npm audit` not applicable
- [x] T2.4 — Verify ALL acceptance criteria (log below)

## Phase 3 — Documentation and Closing

- [x] T3.1 — Sync `docs/visual-identity.md` (components, rhythm rules, debt resolved)
- [x] T3.2 — Create `features/terminal-ui.md` registry + index
- [x] T3.3 — `CHANGELOG.md` entry
- [x] T3.4 — Update `docs/roadmap.md` (Phase 1 items)
- [x] T3.5 — Spec status → `implemented`
- [x] T3.6 — Commit docs sync on `feat/tui-overhaul` (only this feature's files)
- [x] T3.7 — Handoff notes in this file

---

## Acceptance Criteria Verification Log

| AC | Status | Evidence (how it was verified) |
|----|--------|--------------------------------|
| AC-01 | ✅ | `grep -n "const pc" src/cli.js` → no matches; `node --check src/cli.js` → OK |
| AC-02 | ✅ | Harness output at 80 cols: exactly one blank line between every adjacent block; 0 between tool rows |
| AC-03 | ✅ | Harness: tool rows inside `╭─ tools ─╮` with blank before/after |
| AC-04 | ✅ | Harness: Read=info, Write/Edit=warn, Exec=red, Grep/Find=purple, List=muted |
| AC-05 | ✅ | `grep -n "response received" src/agent.js` → no matches (silent `spinner.stop()`) |
| AC-06 | ✅ | Harness: thinking header/content in muted; one blank after block in both modes |
| AC-07 | ✅ | Harness: blank inner rows + bold accent `emile` label |
| AC-08 | ✅ | Harness: `off` rendered dim, `on` green |
| AC-09 | ✅ | Harness: one blank line between session bar and prompt |
| AC-10 | ✅ | `node --check` all files OK; harness ANSI-reset scan clean |

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| 92f5f3e | docs(spec): refine tui-overhaul scope for pass 1 | specs/2026-08-25-tui-overhaul/* |
| 11c1d9a | feat(ui): vertical rhythm, tool box and dimmed thinking | src/ui.js, src/agent.js |
| 53e4729 | refactor(cli): replace legacy pc remap with C palette | src/cli.js |
| 3837017 | test(ui): extend render harness with full simulated turn | test-ui.js |
| — | docs: sync visual identity, roadmap, changelog and feature registry | docs/, features/, CHANGELOG.md, specs/ |

## Handoff Notes

- Items deferred by design (spec § 5): section dividers, radio-style selects, persistent header, `/cost` box, API error box, narrow-width audit — each is a candidate for a follow-up spec.
- The render harness (`test-ui.js`) is manual/scripted verification, not an automated suite — the automated suite remains Phase 2 of the roadmap.
- The thinking-stream cursor math keeps gap lines out of the erase count; if a future change adds lines *inside* the redrawn block, re-verify AC-02/AC-06.
