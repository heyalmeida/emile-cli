# Spec: Verb-grouped tool rows (P1-18 Stage B-1)

| Field | Value |
|-------|-------|
| **ID** | `2026-10-11-design-tool-grouping` |
| **Status** | `approved` |
| **Phase/Context** | Wave 3 — design language, **Stage B-1** of `specs/2026-10-11-design-ux-pass` (deep-dive P1-18), audit idea 8 — the prioritized list's **P0-1** |
| **Related documents** | [audit § 8](../2026-10-11-design-ux-pass/audit.md), [visual identity](../../docs/visual-identity.md), [`specs/2026-10-11-design-token-roles`](../2026-10-11-design-token-roles/spec.md) (the role layer this consumes) |

---

## 1. Problem / Motivation

A turn's tool calls print **one row each**, unconditionally: `printToolSummary`
(`src/ui/tool-lines.js`) renders `  ● <label 8ch> <dim arg>` per call and only
counts them afterwards (`turnState.toolsRun` → the dim `↳ N tools` header above the
response, `src/ui/response.js:59-63`). A turn that reads 20 files therefore prints
**20 rows** — the batch's shape (one operation, many places) is invisible, and the
transcript's noisiest part is the part that carries the least information per row.

The reference solves this by folding a run of similar non-destructive tool calls
into one verb-grouped header — `Read 10 files, Ran 2 subagents`
(`scrollback/state/verb_group.rs:1-10`), with the verb in the tense that matches
the state (`VerbGroupKind::verb(running)` — present while running, past when done,
`scrollback/blocks/tool/mod.rs:107-126`) and the noun pluralized by count
(`:128-145`).

## 2. Goal

Adjacent similar-tool rows collapse into ONE grid row that keeps the existing
vocabulary (bullet, 8-column label column, semantic role tone) and lists up to
three distinct arguments followed by an explicit `+N more` count — while
side-effect operations (`write`/`edit`/`exec`/memory proposal) keep one row each,
because there the argument *is* the information.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-----------|---------------------|
| RF-S01 | A run of **adjacent** details that share the same role tone, label and MCP-ness, and whose length is ≥ `GROUP_MIN = 3`, renders as one row. | Must |
| RF-S02 | The grouped row lists up to `GROUP_ARGS_SHOWN = 3` **distinct** first-line arguments, then `+N more`, where N counts the calls not represented in the list. The marker is never dropped by truncation. | Must |
| RF-S03 | Never grouped: `mutate` (write/edit/memory proposal) and `danger` (exec) rows, and any `workflow` row. Those keep the existing per-row rendering, including multiline continuation lines. | Must |
| RF-S04 | A run shorter than the threshold renders exactly as today (byte-identical), so single-call and two-call turns do not change. | Must |
| RF-S05 | The row is bounded to the terminal width: arguments are dropped from the list (growing `+N more`) until it fits; every argument is `stripTerminalControls`-sanitized exactly as today. | Must |
| RF-S06 | `turnState.toolsRun` still receives the total number of calls (the `↳ N tools` header is a different fact from the batch's shape) and the leading `GAP.section` / print-once commit are unchanged. | Must |
| RF-S07 | `visual-identity.md` § 3 documents the grouping rule; the feature registry and CHANGELOG record it. | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|----------|
| **Risk classification** | **Low** — presentation only, inside one module; no layout budget, cursor, lease or frontier path changes. |
| **Assets/secrets** | Not applicable. |
| **Command execution / file writes** | Not applicable. |
| **Untrusted inputs** | Tool arguments are model-controlled: each one already passes `stripTerminalControls` before rendering, and the grouping pass merges **already-sanitized** strings, so a crafted argument cannot inject an escape or a newline (first lines only). |
| **Negative criteria** | A grouped row must not hide which operation happened (the label and its role tone survive), must not merge different labels/servers (the key includes both), and must never fabricate a count (N is derived from the run length). |

## 5. Out of Scope

- The rest of audit Stage B (the expand affordance/`Ctrl+E`, the error banner, session-event prose) — separate specs.
- The reference's `verb + noun` phrasing (`Read 20 files`): emile's grid lists the *places*, which the audit chose to keep; recorded as an open alternative, not implemented.
- A running-vs-done tense switch: emile prints the batch **after** it executes (the loop calls `printToolSummary` once per tool batch), so there is no streaming state to reflect. Recorded as N/A for emile.
- The `↳ N tools` header, the spinner, the response box: untouched.

## 6. Acceptance Criteria

- **AC-01:** Given 20 adjacent `readFile` calls, when the summary is printed, then there is exactly ONE row for them, it contains `3` distinct paths and `+17 more`, and no other `read` row exists.
- **AC-02:** Given 3 adjacent `grepSearch` calls, then one row lists all three queries and carries **no** `more` marker; given 2 adjacent reads, then two rows are printed (unchanged behaviour).
- **AC-03:** Given a run of reads interrupted by an `editFile`, then the reads before and after group separately and the edit keeps its own row; given 3 `runCommand` calls, then three rows are printed.
- **AC-04:** Given repeated identical arguments (5 reads of the same path), then the row lists that path once and `+4 more`.
- **AC-05:** Given a 60-column terminal and long paths, then no rendered line exceeds the width and the `+N more` marker is present.
- **AC-06:** Given rows from two different MCP servers, then they do not merge.
- **AC-07:** Given the full gate, then `mcp-tool-visibility`, the four UI suites and `token-roles` stay green, `npm test` exits 0 and `npm run lint` reports 0 errors.
- **AC-08:** Given the change, then `docs/visual-identity.md` § 3, `features/terminal-ui.md` and `CHANGELOG.md` describe it.

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|---------|--------------------|
| A grouped row could hide a file the user wanted to see. | Information loss. | The row lists up to 3 paths and states the hidden count; the tone+label say what happened, and the total stays in `↳ N tools`. The threshold (3) means short sequences are untouched. |
| Threshold choice (2 vs 3). | Noise vs verbosity. | 3, per the audit's stated default (Q6); `GROUP_MIN` is a named constant, so the answer is a one-line change. |
| `write`/`edit`/`exec` grouping (audit Q6, second half). | Paths would disappear. | Side-effect verbs never group in this stage (the audit's default); if the user prefers a compact `edit 3 files`, it is a follow-up with the same mechanism. |
| Column math regression. | Misaligned grid. | The label column width and prefix shape are unchanged; the group text is bounded by the same `maxArg` computation, asserted by the existing alignment tests plus AC-05. |

## 8. References

- Audit: `specs/2026-10-11-design-ux-pass/audit.md` § 8 (verdict `adopt`, P0-1) and the open question Q6.
- Reference (verified 2026-10-11): `scrollback/state/verb_group.rs:1-10` (the folded-run header and the shared bucket vocabulary), `scrollback/blocks/tool/mod.rs:71-145` (`VerbGroupKind`, `verb(running)`, `noun(count)`), `scrollback/render.rs:444` (the synthetic overflow header — emile folds the count into the row instead, one row fewer).
- Design contract: `docs/visual-identity.md` § 3 (tool lines grid + semantic tool colors), § 2 (roles).
- Constraint: the print-once frontier (`specs/2026-10-10-ui-commit-frontier`) — the group is committed as one block, exactly as the rows were.