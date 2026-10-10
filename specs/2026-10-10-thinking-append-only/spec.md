# Spec: Thinking stream renders append-only with a viewport-clamped erase

| Field | Value |
|-------|-------|
| **ID** | `2026-10-10-thinking-append-only` |
| **Status** | `implemented` |
| **Phase/Context** | Terminal UI / live reasoning stream — deep-dive backlog item **P0-1** (§ 7.2 root cause, § 7.3 test gap, § 7.4 design) |
| **Related documents** | [Brief P0-1](../2026-10-08-deep-dive-backlog/briefs/p0-1-thinking-append-only.md), [Shared constraints](../2026-10-08-deep-dive-backlog/_shared-constraints.md), [deep-dive § 6–7 / § 20](../../docs/deep-dive.md), [Visual identity](../../docs/visual-identity.md), [ADR-0003](../../docs/adr/0003-active-prompt-output-arbitration.md), [Sibling fix P0-4](../2026-10-09-paste-burst-redraw/spec.md) |

---

## 1. Problem / Motivation

**The flagship defect of deep-dive § 7: "the agent is hallucinating".** Expanded
reasoning is the default (`config.expandThinking === true`), and
`appendThinkingStream()` re-renders the **entire accumulated block** on every
delta:

1. it wraps *all* of `_thinkingBuffer` into `newLines` (`src/ui/thinking.js:91-95`);
2. it emits `\x1B[${oldTotal}A` to climb back to the block top (`:103`) — **unclamped**;
3. it re-renders the header and **every** line with a `\r\x1B[K` prefix (`:106-114`);
4. if the block shrank, it clears leftovers (`:117-123`).

That is visually correct only while the whole block still fits *above* the
cursor inside the viewport. Three failure modes (deep-dive § 7.2):

- **Viewport overflow** — once `oldTotal` reaches the visible height, the
  cursor-up stops at the top of the viewport, the older frames have already
  scrolled into the scrollback where no escape can reach them, and each
  subsequent delta paints the whole block **again below the previous frame**.
  The same thought therefore appears N times — which is exactly what the user
  reads as the model repeating itself.
- **Non-TTY stdout** (pipe, redirect, `tee`) — `\x1B[nA` is ignored, so **every
  cumulative frame** lands in the output stream in order. Duplication is
  guaranteed in the redirected file.
- **Interaction with the stdout lease** (ADR-0003) — `listenTurnKeys`
  re-anchors the prompt frame one row below the cursor on every write, so an
  absolute cursor position assumed by the redraw can be invalidated.

There is **no guard of any kind**: the file never consults
`process.stdout.isTTY` or `process.stdout.rows` (verified by grep — F3).

`endThinkingStream()` has the same unclamped climb (`:150`, `\x1B[${totalLines}A`)
on the expanded path; the collapsed path is already append-safe (`:142`).

The sibling half of this failure family was fixed for the persistent prompt in
**P0-4** (`specs/2026-10-09-paste-burst-redraw`), which introduced the
viewport-clamp primitive this change reuses and shares.

**Why the suite never caught it (§ 7.3):** a fake stdout that compares the
*final* buffer always passes, because the last frame is correct by definition —
the artifact is the **intermediate frames** left in the scrollback. The
regression has to **count occurrences of a unique marker** across the raw writes.

## 2. Goal

A reasoning fragment is rendered **exactly once** on any stdout — TTY or pipe,
any viewport height — and no emitted cursor-up ever exceeds what the viewport
can honor, while a short stream that fits keeps today's in-place redraw.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-------------|---------------------|
| RF-S01 | `src/ui/terminal-cursor.js` exports the viewport clamp (`viewportCursorUp()`, `writeCursorUp(rows)`) moved **verbatim** from `prompt-input-persistent.js`, which imports them back with zero behaviour change. | Must |
| RF-S02 | `appendThinkingStream` keeps the in-place redraw **only** while `process.stdout.isTTY`, the stream has not latched append-only, and the block fits (`header + newLines.length <= max((rows \|\| 50) - 2, 1)`). | Must |
| RF-S03 | The in-place path's cursor-up goes through the shared clamp, so it can never emit an `ESC[nA` beyond `rows - 1` even if the fit estimate is off by a row. | Must |
| RF-S04 | Once the block cannot fit (or stdout is not a TTY), the stream **latches** append-only for the rest of its life: it emits only the lines not yet printed, never climbs more than one row. | Must |
| RF-S05 | Append-only emission writes closed lines with a trailing `\n` and keeps the newest line as a single "open" tail written **without** `\n`; the next delta rewrites that tail in place with `\r\x1B[K` before appending further lines. | Must |
| RF-S06 | No reasoning text is ever emitted twice in append-only mode, and no line is ever erased once it may have scrolled. | Must |
| RF-S07 | `endThinkingStream` must not climb to a possibly scrolled header when the stream latched append-only (or stdout is not a TTY): it closes the open tail and appends a fresh one-line footer (`  ✻ Thought for Ns`). Otherwise it keeps today's header rewrite, clamped. | Must |
| RF-S08 | Collapsed mode (`config.expandThinking === false`) is untouched: one ghost start line plus one `··· thought Ns` close line, no block redraw. | Must |
| RF-S09 | The wrap math, the `innerW = max(columns - 4, 40)` budget and the muted styling are unchanged. | Must |
| RF-S10 | The `EMILE_DEBUG_THINKING` diagnostics keep logging every emission via `debugWrite`. | Must |
| RF-S11 | The public API is unchanged: `startThinkingStream`, `appendThinkingStream`, `endThinkingStream`, `printThinking` (and the `ui/index.js` barrel). | Must |
| RF-S12 | Per-stream state is fully reset on `startThinkingStream`/`endThinkingStream`, so a second reasoning stream in the same process cannot inherit a stale latch. | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|----------|
| **Risk classification** | **Low** per [Code Quality and Security § 1](../../docs/code-quality-and-security.md) — pure `src/ui/` terminal rendering; no command execution, no paths, no credentials, no LLM input parsing. Failure mode is cosmetic (a duplicated or clipped thought). |
| **Assets/secrets** | Reasoning text is already rendered by this module and is already stripped from session persistence; no new output surface, no new logging of content (the debug trace stays opt-in). |
| **Command execution / file writes** | Not applicable — the module never executes anything and never writes files. |
| **Untrusted inputs** | Reasoning deltas come from the provider (untrusted). They are only wrapped, muted and emitted — never interpreted as escape sequences by us; the existing styling path is unchanged. |
| **Negative criteria** | Must NOT: emit an `ESC[nA` larger than `rows - 1`; erase a line that may have scrolled; emit any cursor-up at all in append-only mode beyond a single-row tail rewrite; change collapsed output; change `prompt-input-persistent.js` behaviour during the extraction; remove the debug diagnostics or the wrap math; weaken or delete an existing test; add a dependency. |

## 5. Out of Scope

Reported, not fixed (Rule 6.2):

- **The response streamer** (`src/ui/response.js`) — its own § 7.4 item; this brief is thinking-only.
- **`src/ui/turn-keys.js`** — carries the same uncapped pattern (`:73` `\x1B[${reserveRows}A`, `:78`, `:91`); **reported** in the handoff, not fixed here.
- **`src/ui/model-picker.js:145`, `src/ui/prompt-input.js:192,234,242,365`** — same family, other owners.
- **The `[Pasted: N lines]` chip / viewport-budgeted prompt layout** — backlog P2.
- **`agent.js` per-delta wiring** — the API contract does not change.

## 6. Acceptance Criteria

- **AC-01:** Given `process.stdout.isTTY = false`, when a 200+ line reasoning stream containing the unique marker `APPEND_ONLY_MARKER_XYZ` is fed in 30 deltas, then the marker appears **exactly once** in the raw writes and no `ESC[nA` with `n > 1` is ever emitted.
- **AC-02:** Given a TTY with `rows = 24`, when the same stream is fed, then the marker appears **exactly once** and no `ESC[nA` with `n > 23` is emitted — in `appendThinkingStream` **and** `endThinkingStream`.
- **AC-03:** Given an over-viewport block, when `endThinkingStream()` runs, then no cursor-up beyond the clamp is emitted and the open tail line is closed and followed by the fresh one-line footer.
- **AC-04:** Given a short stream that fits, then the in-place rewrite path is still used: the text appears once **and** cursor-up sequences were emitted (it did not silently degrade to append-only).
- **AC-05:** Given `config.expandThinking = false`, then the output is exactly the ghost start line plus the one-line `··· thought Ns` close, with no block redraw and no `ESC[nA` beyond one row.
- **AC-06:** `test/prompt-input-render.test.js` stays **20/20** after the clamp extraction (pure move, no behaviour change), and `test/thinking-during-active-turn.test.js` — which drives the real stream through `runAgent` under the `listenTurnKeys` lease — keeps passing.
- **AC-07:** `node --check` clean on the three touched files; the full suite exits 0; `npm run lint` reports 0 errors.
- **AC-08:** A second reasoning stream in the same process starts with fresh state (no inherited append-only latch).
- **AC-09:** Rule 2 docs sync: CHANGELOG `[Unreleased] → Fixed`; `docs/deep-dive.md` § 7.4 marked applied (it currently says "não aplicada") and § 21.1 P0-1 marked applied; § 20 "Cursor-up frame redraw" row drops the `thinking.js` defect note; `features/terminal-ui.md` Change History row. `docs/architecture.md` ui/ row stays true and needs no change unless it stops being so.

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|---------|--------------------|
| Append-only cannot re-flow a line that already scrolled when a later delta extends it (word wrap moves a word to the next row). | At most one row can look stale for a moment; the open-tail rewrite handles the common case (the newest line is rewritten in place on the next delta). | Accepted and inherent to append-only (deep-dive § 7.4 § 1 acknowledges the partial-growth case). The alternative — a cumulative redraw — is the bug. |
| The in-place path still assumes the block fits; if `rows` lies (resize mid-stream), the erase could over-climb. | A visually stale frame. | The latch is re-evaluated on every delta and the climb is clamped (RF-S03), so the worst case is a partial erase, never an unbounded escape. |
| Splitting the in-place climb into its own `write` changes write granularity under the ADR-0003 lease. | Slightly more prompt repaints during reasoning. | This is the same shape P0-4 already uses in `prompt-input-persistent.js` (`erasePreviousBlock` writes its clamp separately); verified by `test/thinking-during-active-turn.test.js`. |
| A test that captures stdout without pinning `isTTY` would silently take the append-only path. | A green test could exercise the wrong branch. | The new suite pins `columns`, `rows` and `isTTY` per case and restores them in `t.after`; existing suites that touch reasoning either mute stdout or pin `isTTY`. |
| A shrink in wrapped-line count (cumulative-snapshot dedup) could rewind the flush cursor and duplicate text. | Duplicated thought text — the very bug. | The flush cursor is monotone: it never moves backwards, and an out-of-range tail index is clamped to the last available line. |

## 8. References

- `src/ui/thinking.js` — `startThinkingStream`, `appendThinkingStream`, `endThinkingStream`, `printThinking`.
- `src/ui/prompt-input-persistent.js:136-150` — the clamp being extracted (P0-4).
- `src/ui/theme.js` — `C.muted`, `C.ghost`, `GAP`, `wrapText`.
- `src/agent/agent.js:491-495, 506-510, 589-592` — the per-delta/end-of-stream wiring (unchanged).
- `test/thinking-during-active-turn.test.js` — the lease-aware harness that must keep passing.
- grok-build / codex reference behavior: the "print-once commit boundary" discipline described in deep-dive § 22.1.