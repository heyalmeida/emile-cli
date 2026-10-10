# Tasks: Design & UX pass with grok-build as the design base

> Phase 1 only (the audit). Stages A–F get their own `tasks.md` after approval.
> Mark `- [x]` only after verifying.

| Field | Value |
|-------|-------|
| **Spec** | `2026-10-11-design-ux-pass` |

---

## Phase 0 — Preparation

- [x] T0.1 — Read the design contract (`docs/visual-identity.md` § 1–6), the ADRs (0001, 0003) and the brief `p1-18-design-ux-pass.md` — *Rule 1*
- [x] T0.2 — Confirm the scope with the spec (`approved` for Phase 1; Stages A–F pending)
- [x] T0.3 — Classify risk (Low for Phase 1 — a document)
- [x] T0.4 — Confirm the branch is `development` and inspect `git status` — *Rule 8*
- [x] T0.5 — Read the "today" facts from the code, not from memory: `src/ui/{theme,tool-lines,response,thinking,user-message,status-bar,spinner,prompt-input-persistent,diff-block,markdown}.js`, `src/api/transports/base.js`, `src/agent/agent.js` call sites, `src/config.js`
- [x] T0.6 — Verify the free-key set by scanning every `key.ctrl` comparison in `src/` (`Ctrl+E/F/G/H/.` free; `Ctrl+C/P/T/U/D` reserved)

## Phase 1 — Reference verification (the gate for everything else)

- [x] T1.1 — Verify every reference citation in the tree; record the result per citation — *(RF-S01, AC-02)*
- [x] T1.2 — Correct the citations that did not verify and state the correction in the audit (§ 11/Appendix): `accent_memory` → `accent_remember`; `md_h1/md_h2` → `md_heading_h1…h6`; the `appearance/config.rs` path is under `xai-grok-pager-render/`; the `╶╶ N more` glyph does not exist (replaced by a synthetic `N more` row); "a successful compaction is deliberately invisible" is stronger than the tree supports
- [x] T1.3 — Read the reference files for each of the ten ideas plus the anti-pattern sites, and extract the *design principle* in one sentence each

## Phase 2 — The audit document

- [x] T2.1 — Write `audit.md` with the ten ideas + the anti-pattern section, each with the four labeled parts (**Reference** / **Emile today** / **Proposal** / **Verdict**) — *(RF-S02)*
- [x] T2.2 — Give every proposal a before → after ASCII sketch, its row/column delta, its keys/tokens and the files it touches — *(AC-03)*
- [x] T2.3 — State the reason for every `skip` (idea 3's `terminal_default` palette, idea 5's band, idea 9's `[stop]` button) and do not revisit it later — *(AC-04)*
- [x] T2.4 — Close with the prioritized proposal list P0→P3 and the open questions as concrete either/or choices — *(AC-05)*
- [x] T2.5 — Check every proposal against the invariant list (print-once, DEC 2026, frame budget, clamp, lease, vertical rhythm, open-box/right-padding) — *(RF-S05)*

## Phase 3 — Stage plan and closing

- [x] T3.1 — Record the stage plan A–F in `plan.md`, one session each, with the dependency reason for the order and the overlap note with P2-15 — *(RF-S06)*
- [x] T3.2 — Register the phase in the CHANGELOG's Docs section (the only file touched outside the spec folder)
- [x] T3.3 — Check the touched Markdown tables for column consistency, and confirm no Mermaid block was added
- [x] T3.4 — Verify `git status` shows no modified file outside `specs/2026-10-11-design-ux-pass/` and `CHANGELOG.md` — *(AC-06)*
- [x] T3.5 — Commit the Phase 1 documentation on `development` with explicit paths — *Rule 8*
- [x] T3.6 — STOP and hand the audit to the user for approval before Stage A

---

## Acceptance Criteria Verification Log

| AC | Status | Evidence (how it was verified) |
|----|--------|--------------------------------|
| AC-01 | ✅ | `specs/2026-10-11-design-ux-pass/{spec,plan,tasks}.md` created from the templates' sections (spec: problem/goal/RFs/risk/scope/AC/risks/refs; plan: approach/compliance/security/modules/flags/files/decisions/verification/git/failures/risks; tasks: phases + AC log). |
| AC-02 | ✅ | `audit.md` § 1–11 each carry the four labeled parts; the Appendix lists all 27 citation checks, including the five that did **not** verify as written (RF-S01). |
| AC-03 | ✅ | Every **Proposal** block has a before → after sketch and a `*Cost:*` line naming rows/columns, keys, tokens and files (e.g. § 4 "Row delta: **−2 rows** per response"; § 6 "0 new rows; 1 new module + 1 new panel; 1 new key"). |
| AC-04 | ✅ | The three `skip`s are argument-level and labeled in place (§ 3 `terminal_default` palette, § 5 band, § 9 `[stop]` button); none is revisited later — the prioritized list references only the adopted/adapted parts. |
| AC-05 | ✅ | `audit.md` ends with "Prioritized proposal list" (P0-1 … P3-12) and "Open questions for the user" (8 either/or items, each with a stated default). |
| AC-06 | ✅ | `git status --short` after the commit shows only the spec folder and `CHANGELOG.md`; no code file is staged or modified. |

> Legend: ⏳ pending / ✅ verified / ❌ failed

## Commit Log

| Commit | Message | Files |
|--------|---------|-------|
| (this commit) | `docs(design): P1-18 Phase 1 — design & UX audit against grok-build` | `specs/2026-10-11-design-ux-pass/{spec,plan,tasks,audit}.md`, `CHANGELOG.md` |

## Handoff notes

- **Phase 1 is a document and stops here** (Step 4 of the brief). No UI code was
  written and nothing found during the audit was "fixed in passing" (Rule 6.2).
- **The audit's own ACs are bound to a decision the user still owes**: ideas 4 and
  5 amend a documented rule of `visual-identity.md`, so they are presented as Open
  Questions. The stage plan stays valid either way (the rail is P2-7, i.e. after the
  vocabulary stages).
- **Two emile-side findings recorded for later stages** (not fixes, not debt items
  yet): `cache hit: N%` is rendered with the *success* token
  (`src/ui/status-bar.js:51`) — a state color used for a metric; and the diff block
  uses heavy corners `┌`/`└` (`src/ui/diff-block.js:32,77`) where every other box
  uses rounded `╭`/`╰`.
- **Not done, by design**: the reference's `terminal_default` appearance mode (a
  whole second palette — noted as optional debt in § 3), its mouse-driven `[stop]`
  button (§ 9) and its three-mode fold cycle (§ 7, deferred to its own spec).