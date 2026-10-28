# Spec: Semantic token roles and the de-emphasis rules (P1-18 Stage A)

| Field | Value |
|-------|-------|
| **ID** | `2026-10-11-design-token-roles` |
| **Status** | `approved` |
| **Phase/Context** | Wave 3 — design language, **Stage A** of `specs/2026-10-11-design-ux-pass` (deep-dive P1-18), audit ideas 1, 2 and 3 |
| **Related documents** | [audit § 1–3](../2026-10-11-design-ux-pass/audit.md), [visual identity](../../docs/visual-identity.md), [architecture](../../docs/architecture.md), [ADR-0001](../../docs/adr/0001-tech-stack-choice.md) |

---

## 1. Problem / Motivation

`src/ui/theme.js:24-37` exports the single palette `C`, but every entry is named
after its **hue** (`accent`, `gold`, `info`, `success`, `warn`, `red`, `fg`,
`muted`, `ghost`, `dim`). Meaning lives only in prose (`docs/visual-identity.md`
§ 2–3), so a component picks a color by taste and two real defects shipped:

- `cache hit: N%` is rendered with the **success** token (`src/ui/status-bar.js:51`)
  — a state color used for a neutral metric, which reads as "cache is good" when
  the number is simply information;
- the collapsed thinking one-liner is a hardcoded near-background gray
  (`C.ghost = #3B4261`, `src/ui/thinking.js:122,261,323`) — the **only** signal
  that reasoning happened, invisible when a profile's background is darker than
  that value (audit idea 3; the reference's rule is
  `theme/terminal_default.rs:12-18`).

The audit's Stage A is the prerequisite for every later stage, because Stage B–F
should name a *role*, not a hue.

## 2. Goal

`ROLE` exists in `src/ui/theme.js` as a pure alias layer over `C` (no new color),
the three de-emphasis functions and the agent/user/border roles are bound at the
call sites that carry that meaning, and the two defects above are fixed — with
every other rendered byte unchanged.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-----------|---------------------|
| RF-S01 | `src/ui/theme.js` exports `ROLE` with `user`, `agent`, `thinking`, `tool.{passive,mutate,danger,search,plain,workflow}`, `success`, `warn`, `running`, `error`, `diff.{insert,delete,context}`, `meta.{punct,label}` and `border.{box,focused}`. **Every** member is an alias into `C` — no new color value, no second palette. | Must |
| RF-S01b | **No `ui/` module other than `theme.js` may declare a color helper or a truecolor literal.** `spinner.js` violated this with its own `amber`/`muted`/`green`/`red`/`info` helpers (a second palette that can drift); it now consumes the role layer. Output must stay byte-identical. *(Added during implementation — see the Scope change note in § 9.)* | Must |
| RF-S02 | `ROLE.tool[...]` is resolved by *meaning*, not by tool name: the tool-tone table is rewritten to role keys, so the tone vocabulary survives a color retune. Output bytes must be identical. | Must |
| RF-S03 | The de-emphasis scale is bound **by function**: counts/punctuation markers → `meta.punct` (`C.dim`, SGR 2 on the terminal's own fg); labels, footers, args-context and borders → `meta.label`/`border.box` (`C.muted`). | Must |
| RF-S04 | The collapsed thinking one-liner uses the DIM attribute (the terminal's own fg) instead of the hardcoded `ghost` gray, in all three render paths (`startThinkingStream`, `endThinkingStream`, `printThinking`). | Must |
| RF-S05 | The cache-hit segment stops using the success token (it is a metric, not a state). | Must |
| RF-S06 | No role is introduced without a call site that consumes it in this stage; roles whose consumer arrives later (e.g. the error-banner pair in Stage B) are **not** added speculatively. | Must |
| RF-S07 | Only the two defects (4 sites) may change rendered bytes; every other touched call site is a rename, and no role may be used to justify a restyle. | Must |
| RF-S08 | `visual-identity.md` § 2 carries the role table and the three rules (function-based scale, DIM-not-hardcoded-gray, state colors only for states); § 6 gains a review line; the feature registry and CHANGELOG record the stage. | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|----------|
| **Risk classification** | **Low** — a palette alias layer plus four intended byte changes; every changed file renders to the terminal but no layout, cursor math, budget or lease path is touched. |
| **Assets/secrets** | Not applicable — no credential, session or memory surface; nothing is persisted. |
| **Command execution / file writes** | Not applicable. |
| **Untrusted inputs** | Unchanged: role functions are formatting helpers applied to already-sanitized strings (`clipLine`, `sanitizeAssistantOutput`, `stripTerminalControls`). No new input can influence a role's token. |
| **Negative criteria** | No new color literal may enter `ROLE`; no hardcoded near-background gray may be used for text the user must read; no component may skip the role layer for a *state* (success/warn/diff) it reports. |

## 5. Out of Scope

- **Stage B–F**: verb-grouping, the hint bar/cheatsheet, the error banner, the turn-status line, markdown rules, the rail vocabulary (audit ideas 4–11) — Stages A–F are one session each.
- **Restyling**: changing tool-arg de-emphasis (`C.dim` args → `muted`), the divider dashes, `dry-run`'s red, or any glyph/box change (the audit records the box parity item for Stage E).
- The reference's `terminal_default` appearance mode (a second palette — audit § 3 records it as optional debt).
- Non-`ui/` modules (`src/agent/`, `src/commands/`, `src/cli.js`, `src/api/`): they keep `C` and adopt roles as their own stages touch them.
- Any new dependency, build step or TypeScript.

## 6. Acceptance Criteria

- **AC-01:** Given `ROLE`, when each member is compared against its documented token, then it is the *same function* (`ROLE.meta.label === C.muted`), so `grep` for a color literal in the role block finds none.
- **AC-02:** Given `formatToolSummary` over one tool of every taxonomy branch, when the returned `tone` values are collected, then every one is a key of `ROLE.tool` (and the six roles map to the same tokens as before, so the rendered rows are byte-identical).
- **AC-03:** Given a collapsed thinking stream (`startThinkingStream`/`endThinkingStream`) and `printThinking` in collapsed mode, when the bytes are inspected, then the line is written with the DIM sequence and contains no `ghost` RGB triple.
- **AC-04:** Given a session bar with cached tokens, when the bar is rendered, then the cache segment carries the `meta.label` token and **not** the success token.
- **AC-05:** Given the four UI suites plus `commit-frontier` and `turn-keys-visibility`, when the full gate runs, then every suite keeps its count, `npm test` exits 0 and `npm run lint` reports 0 errors.
- **AC-06:** Given the change, then `docs/visual-identity.md` (§ 2 role table + rules, § 6 checklist), `docs/deep-dive.md` § 19, `features/terminal-ui.md` and `CHANGELOG.md` describe it.
- **AC-07:** Given every module in `src/ui/`, when each is scanned, then only `theme.js` contains the `rgb()` helper / a `38;2;` literal, and the spinner's frame/label/stop marks render with the same bytes the local helpers produced (`ROLE.running`, `ROLE.meta.label`, `ROLE.success`, `ROLE.error`, `C.info`).

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|---------|--------------------|
| A role could become a second palette (someone adds a hex inside `ROLE`). | Two sources of truth again. | AC-01 asserts alias identity per member; the role block carries a "no literals here" comment. |
| Renaming the tool tones breaks a consumer. | Rows lose their color. | Verified: `tone` has exactly one consumer (`tool-lines.js:124`) and no test asserts its strings. |
| `ghost` loses its only consumer and becomes an unused token. | A "dead" palette entry. | Kept deliberately and documented as reserved for decorative marks inside an already-visible line; removing a palette token is a separate decision the audit did not take. |
| The audit's § 2 table lists tool args under the middle step (which would be a restyle). | Scope creep into Stage B/E. | Stage A keeps the args' token and records the deviation in the plan; the stage gate is "a rename, not a restyle". |
| Role names could drift from the reference's vocabulary. | Later stages re-invent names. | The role set mirrors the reference where a role exists (user/agent/thinking/tool/success/error/border) and uses emile's own verbs (`passive/mutate/danger/search/plain/workflow`) for the tool taxonomy. |
| A module could keep a private palette outside the ESLint-guarded files. | Two sources of truth; a retune silently misses it. | AC-07 makes it a gate over the whole `ui/` tree, and the guard rails were extended to `src/ui/` in `.eslintrc.json` (see § 9). |

## 9. Scope change during implementation (Rule 3)

Recorded **after** the change, in the order the spec requires (spec first, then the
code that follows it):

The alias-identity test (AC-01) scans the whole `src/ui/` tree for a second
palette, and it failed on `src/ui/spinner.js:51-58` — five local helpers
(`amber`, `muted`, `green`, `red`, `info`) plus their own `rgb()`/`RESET`,
i.e. **a duplicate palette with hardcoded truecolor values**, invisible to the
existing ESLint guard (`.eslintrc.json` restricts `agent/agent.js`,
`agent/compression.js`, `api/client.js` and `plans.js` — not `src/ui/`). That is
the exact defect visual-identity § 1.1 ("one palette, one source of truth") and
audit idea 1 exist to prevent, so it was fixed inside this stage rather than
reported: `spinner.js` now consumes `ROLE.running` / `ROLE.meta.label` /
`ROLE.success` / `ROLE.error` / `C.info`, two roles gain their first consumer
(`running`, `error` — RF-S01), the ESLint override now covers the `ui/` tree, and
**no rendered byte changes** (AC-07).

## 8. References

- Audit: `specs/2026-10-11-design-ux-pass/audit.md` § 1, § 2, § 3 (+ the prioritized list P0-2).
- Design contract: `docs/visual-identity.md` § 1 (principles), § 2 (palette), § 3 (components + semantic tool colors), § 6 (checklist).
- Reference (verified 2026-10-11): `xai-grok-pager-render/src/theme/mod.rs:1` (single source), `theme/tokyonight.rs:56-64,70-74,86-101,123-142` (roles, three-step gray by function, borders, md/diff families), `theme/terminal_default.rs:12-18` (DIM instead of bright black, test-enforced palette composition).
- Robustness invariants that constrain the stage: `specs/2026-10-10-ui-commit-frontier`, `specs/2026-10-10-frame-transition-flicker` (no layout/cursor change here).