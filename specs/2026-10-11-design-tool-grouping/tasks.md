# Tasks: Verb-grouped tool rows (P1-18 Stage B-1)

> Fill in from the `plan.md`. Each task must be small, verifiable and traceable to an acceptance criterion (AC). Mark `- [x]` only after verifying.

| Field | Value |
|-------|-------|
| **Spec** | `2026-10-11-design-tool-grouping` |

---

## Phase 0 — Preparation

- [x] T0.1 — Read the audit § 8, the Stage A role layer, `docs/visual-identity.md` § 3 and the tool-row code — *Rule 1*
- [x] T0.2 — Confirm the spec/plan are approved (the user asked for visible change after Stage A, whose aliasing produced none)
- [x] T0.3 — Classify risk (Low: presentation in one module)
- [x] T0.4 — Confirm the branch is `development` — *Rule 8*
- [x] T0.5 — Baseline: `npm test` 484 / 474 pass / 0 fail / 10 env skips; `npm run lint` 0 errors / 144 warnings

## Phase 1 — Implementation

- [x] T1.1 — `groupRows(details)` (exported, pure): runs of ≥ `GROUP_MIN = 3` adjacent details sharing tone+label+MCP-ness become one row; everything else stays in order — *(AC-01, AC-03, AC-06)*
- [x] T1.2 — The grouped row lists up to `GROUP_ARGS_SHOWN = 3` distinct first-line arguments then `+N more`, N counted in **calls**, shrinking the list until it fits so the marker always survives — *(AC-01, AC-04, AC-05)*
- [x] T1.3 — `printToolSummary` iterates the plan, sharing `prefixFor`/`argWidthFor` between single and grouped rows (so the grid math has one source), keeping the multiline continuation path for singles — *(AC-02)*
- [x] T1.4 — Unchanged: `turnState.toolsRun` still counts every call, the leading `GAP.section` and the single print-once commit stay — *(AC-07)*

## Phase 2 — Testing, Security and Verification

- [x] T2.1 — `test/mcp-tool-visibility.test.js`: the 20-read batch (one row, 3 paths, `+17 more`, no leak), threshold behaviour (3 groups / 2 does not), interruption + side-effects (reads split, `edit` and 3× `exec` stay per-row, order preserved), repeated arguments (`+4 more` for 5 reads of one file), narrow width at 60 columns (every line bounded, marker present), MCP servers never merge, and the pure plan + the turn counter — *(AC-01…AC-07)*
- [x] T2.2 — `node --check src/ui/tool-lines.js`
- [x] T2.3 — Removed the now-unused `maxArg` binding so the lint baseline stays at 144 warnings
- [x] T2.4 — Manual render check: a 26-call batch (20 reads + 4 greps + 1 edit + 1 exec) renders as 4 rows, verified by capturing the real output
- [x] T2.5 — `npm test` 491 / 481 pass / 0 fail / 10 env skips; `npm run lint` 0 errors / 144 warnings — *(AC-07)*
- [x] T2.6 — Verify every acceptance criterion (log below)

## Phase 3 — Documentation and Closing

- [x] T3.1 — Rule 2 sync: `docs/visual-identity.md` (§ 3 new "Verb-grouped tool batches" row; the tool-row row points at roles; the status-bar row now states that `printSessionBar` is not called by the CLI; two new § 5 debt items), `features/terminal-ui.md` (details row + Change History), `CHANGELOG.md` (Changed)
- [x] T3.2 — Feature registry updated (an improvement to an existing feature)
- [x] T3.3 — CHANGELOG entry recorded
- [x] T3.4 — Mermaid: none added or edited; the touched tables re-checked
- [x] T3.5 — Spec status: implemented
- [x] T3.6 — Committed on `development` with explicit paths
- [x] T3.7 — Handoff records what was deliberately not adopted and the deferred items

---

## Acceptance Criteria Verification Log

| AC | Status | Evidence (how it was verified) |
|----|--------|--------------------------------|
| AC-01 | ✅ | Test: 20 adjacent reads → 1 `● read` row, matching `src/file-00.js, src/file-01.js, src/file-02.js, +17 more`, and no path on a second row. (With longer paths the width loop correctly shows 2 paths + `+18 more` — the marker is preserved either way.) |
| AC-02 | ✅ | Test: 3 greps → one row listing `auth, token, session` with no marker; 2 reads → two rows, unchanged. |
| AC-03 | ✅ | Test: reads–edit–reads → two read rows and one edit row, in original order; 3 `runCommand` → three rows. |
| AC-04 | ✅ | Test: 5 reads of the same path → the path listed once + `+4 more`. |
| AC-05 | ✅ | Test at `columns: 60` with deep paths → every line ≤ 60 and the row carries `+\d+ more`. |
| AC-06 | ✅ | Test: 3 × `filesystem__readFile` + 3 × `git__readFile` → two rows, one per server label. |
| AC-07 | ✅ | `node --check` OK; `npm test` **491 tests / 481 pass / 0 fail / 10 env skips** (baseline 484/474; +7 = the new cases); `npm run lint` 0 errors / 144 warnings (baseline unchanged, dead binding removed). |
| AC-08 | ✅ | `docs/visual-identity.md` § 3/§ 5, `features/terminal-ui.md`, `CHANGELOG.md` inspected after the edits. |

> Legend: ⏳ pending / ✅ verified / ❌ failed

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| (this commit) | `feat(ui): verb-group adjacent tool rows` | `src/ui/tool-lines.js`, `test/mcp-tool-visibility.test.js`, `specs/2026-10-11-design-tool-grouping/`, `docs/visual-identity.md`, `features/terminal-ui.md`, `CHANGELOG.md` |

## Handoff notes

- **Not adopted (deliberate):** the reference's `verb + noun` phrasing (`Read 20 files`) — emile's grid names the *places*, which is the information a read/grep row carries; and its running-vs-past tense switch, which has no analogue because emile prints a batch once, after execution (both recorded in the spec's out-of-scope list).
- **Open taste call left as a constant:** the threshold is `GROUP_MIN = 3` (audit Q6's default) and side-effect verbs never group. Both are one-line changes if the user prefers otherwise.
- **Found while syncing the docs (Rule 0 divergence):** `printSessionBar` (`src/ui/status-bar.js`) has **no caller in `src/`** — only `test-ui.js` and the tests use it — so the standalone session bar never renders; the prompt footer carries the same state. Recorded in `visual-identity.md` § 3 and § 5 (either wire it back as the Stage D turn-status line or retire it).
- **Deferred to Stage E:** tool *arguments* still use `C.dim` while the de-emphasis rule sends labels to `ROLE.meta.label`; noted in § 5.