# Tasks: Semantic token roles and the de-emphasis rules (P1-18 Stage A)

> Fill in from the `plan.md`. Each task must be small, verifiable and traceable to an acceptance criterion (AC). Mark `- [x]` only after verifying.

| Field | Value |
|-------|-------|
| **Spec** | `2026-10-11-design-token-roles` |

---

## Phase 0 — Preparation

- [x] T0.1 — Read the audit § 1–3, `docs/visual-identity.md` § 1–3/§ 6 and the ADRs 0001/0003 — *Rule 1*
- [x] T0.2 — Confirm the spec/plan are approved (the user approved the audit and asked to proceed with the stage plan)
- [x] T0.3 — Classify risk (Low: a palette alias layer + four intended byte changes)
- [x] T0.4 — Confirm the branch is `development` — *Rule 8*
- [x] T0.5 — Baseline: `npm test` 477 / 467 pass / 0 fail / 10 env skips; `npm run lint` 0 errors / 144 warnings
- [x] T0.6 — Reconnaissance: the call-site census (`C.gold`/`C.purple` have **0 direct uses** — reachable only through the tone strings; `C.ghost` lives in one file), the `tone` contract (one consumer, no test asserts its strings), the four already-free keys

## Phase 1 — Implementation

- [x] T1.1 — `src/ui/theme.js`: export `ROLE` as pure aliases into `C`, with the rule documented in the block (roles over hues; the three-function scale; no literals here) — *(AC-01, RF-S01)*
- [x] T1.2 — `boxTopOpen`/`boxBottomOpen` bound to `ROLE.border.box` (the choke point of every box consumer) — *(RF-S03)*
- [x] T1.3 — `src/ui/tool-lines.js`: the tone vocabulary becomes role keys (`passive/mutate/danger/search/plain/workflow`), resolved via `ROLE.tool`, with the workflow fallback preserved — *(AC-02, RF-S02)*
- [x] T1.4 — Bind the remaining canonical consumers: status bar (separator/id/tokens/metrics), response (`↳ N tools`, box label, border part), prompt frame (elision markers, footer, prompt glyph, selected marker, draft counter), user message, diff (`insert/delete/context`, corners), picker (focus marker, selected label, query, empty state), config panel (`on`/`off`, plans mode), thinking (header + body) — *(RF-S03)*
- [x] T1.5 — Fix the collapsed thinking line in all three paths (`C.ghost` → the DIM attribute) — *(AC-03, RF-S04)*
- [x] T1.6 — Fix the cache-hit metric (success token → `meta.label`) — *(AC-04, RF-S05)*
- [x] T1.7 — **Scope change (Rule 3, spec updated first):** remove `spinner.js`'s duplicate palette and extend the lint guard over `src/ui/**` — *(AC-07, RF-S01b)*

## Phase 2 — Testing, Security and Verification

- [x] T2.1 — New `test/token-roles.test.js`: alias identity for every member, no literal in the role block, no second palette anywhere in `src/ui/`, tone coverage over one tool per taxonomy branch, a tool row's bytes, the cache-metric fix, the spinner's bytes, and the DIM rule for the collapsed thinking line — *(AC-01…AC-04, AC-07)*
- [x] T2.2 — `node --check` on all eleven touched modules
- [x] T2.3 — Diff audit: every changed line carrying a palette call was classified as a token-identical rename or as one of the intended byte changes (205 token-bearing lines → 195 renames + 10 intended: 7 spinner couples, 3 dim fixes)
- [x] T2.4 — Lint guard verified to **fail** when violated (a temporary probe module in `src/ui/` raised both rules; probe deleted afterwards)
- [x] T2.5 — `npm test` 483 / 473 pass / 0 fail / 10 env skips; `npm run lint` 0 errors / 144 warnings (baseline) — *(AC-05)*
- [x] T2.6 — Verify every acceptance criterion (log below)

## Phase 3 — Documentation and Closing

- [x] T3.1 — Rule 2 sync: `docs/visual-identity.md` (§ 2 role table + the three rules, the `ghost` reservation, the thinking/tool/footer component rows, 3 assessment lines in § 6), `docs/deep-dive.md` § 19 (the role layer + the four byte changes + the spinner find), `features/terminal-ui.md` (details row + Change History), `CHANGELOG.md` (Changed ×3)
- [x] T3.2 — Feature registry updated (an improvement to an existing feature, not a new file)
- [x] T3.3 — CHANGELOG entries recorded (including the scope change)
- [x] T3.4 — Mermaid: none added or edited; the touched tables re-checked for column consistency
- [x] T3.5 — Spec status: `approved` → implemented behaviour delivered (the audit's Stage A)
- [x] T3.6 — Committed on `development` with explicit paths
- [x] T3.7 — Handoff records the deviated audit detail (tool args keep their token) and the residual risks

---

## Acceptance Criteria Verification Log

| AC | Status | Evidence (how it was verified) |
|----|--------|--------------------------------|
| AC-01 | ✅ | `test/token-roles.test.js` — 19 members, each asserted `ROLE.x === C.y` **and** byte-equal for four sample inputs; plus a source check that the `ROLE` block contains no `rgb(`/`bgRgb(`/hex/escape literal. |
| AC-02 | ✅ | Same suite — one tool per branch (15 cases, incl. MCP and an unknown tool) yields a `tone` that is a `ROLE.tool` key **and** keeps its documented meaning; a `grep`+`exec` batch renders with `ROLE.tool.search`/`ROLE.tool.danger` bytes. |
| AC-03 | ✅ | Same suite — `startThinkingStream`+`endThinkingStream` (collapsed) and `printThinking` emit `C.dim('··· thinking')` / `C.dim('··· thought 1s')`, contain `\x1B[2m` and contain **no** `C.ghost(...)` bytes. |
| AC-04 | ✅ | Same suite — `printSessionBar` with cached stats contains `ROLE.meta.label('cache: 87%')` and does **not** contain `C.success('cache: 87%')`. |
| AC-05 | ✅ | 11 modules `node --check` OK; `npm test` **484 tests / 474 pass / 0 fail / 10 env skips** (baseline 477/467 → +7, exactly the new `token-roles` suite) exit 0; `npm run lint` 0 errors / 144 warnings (baseline warnings unchanged), exit 0. |
| AC-06 | ✅ | Four documents inspected after the edits: `docs/visual-identity.md`, `docs/deep-dive.md` § 19, `features/terminal-ui.md`, `CHANGELOG.md`. |
| AC-07 | ✅ | Same suite — the spinner's start/stop bytes equal `C.warn`/`C.success`/`C.red`/`C.info`/`C.muted` compositions (the exact values its removed helpers produced) and `spinner.js` contains no `38;2;`/`rgb(`; a tree scan finds `theme.js` as the only module with the `rgb()` helper. Lint guard proven to fail on a probe. |

> Legend: ⏳ pending / ✅ verified / ❌ failed

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| (this commit) | `feat(ui): semantic token roles` | `src/ui/theme.js`, `src/ui/{tool-lines,status-bar,response,thinking,user-message,prompt-input-persistent,diff-block,model-picker,config-panel,spinner,turn-keys}.js`, `.eslintrc.json`, `test/token-roles.test.js`, `specs/2026-10-11-design-token-roles/`, `docs/visual-identity.md`, `docs/deep-dive.md`, `features/terminal-ui.md`, `CHANGELOG.md` |

## Handoff notes

- **Audit deviation (deliberate):** the audit's § 2 table lists *tool args* under the middle de-emphasis step, which would be a restyle (args are `C.dim` today). Stage A's gate is "a rename, not a restyle", so the args keep their token and the change is recorded as a Stage B/E candidate in the spec's out-of-scope list. Consequence: `ROLE.meta.punct` currently covers counts/markers/punctuation, not arg text.
- **`C.ghost` has no renderer consumer** after the DIM fix. It is kept and documented as reserved (deleting a palette entry is a palette decision the audit did not take). If a future change wants it gone, that is its own small spec.
- **Roles deliberately not added:** a `plan`-mode accent (the footer borrows `warn` for the mode indicator — a Stage F candidate), an `info` role for one-off cyan labels (MCP state, panel headers), and the error-*banner* pair (headline/detail, Stage B). `ROLE.running` and `ROLE.error` were added **because** the spinner fix gave them their first consumer.
- **Residual risk:** the alias-identity test proves roles cannot drift from `C`; the byte-diff gate is the diff audit plus the text-level suites (the existing suites assert stripped text, not colors), so the four intended byte changes are pinned by the new suite rather than by a baseline capture (Rule 8 forbids stash-based baselines).