# Spec: Atomic active-turn frame transition (no flicker while streaming)

| Field | Value |
|-------|-------|
| **ID** | `2026-10-10-frame-transition-flicker` |
| **Status** | `implemented` |
| **Phase/Context** | Wave 2 — UI foundation (deep-dive backlog **P1-16**, the last item of the § 6/§ 19 rendering series) |
| **Related documents** | [deep-dive § 6, § 19, § 21.1](../../docs/deep-dive.md), [architecture](../../docs/architecture.md), [visual identity](../../docs/visual-identity.md), [ADR-0003 (stdout arbitration)](../../docs/adr/0003-active-prompt-output-arbitration.md), [`specs/2026-10-10-ui-commit-frontier`](../2026-10-10-ui-commit-frontier/spec.md) |

---

## 1. Problem / Motivation

While a turn runs, the terminal repaints continuously and visibly (user-reported
2026-10-10: the whole screen, sometimes only the reasoning block, sometimes only
the prompt). The active-turn frame in `src/ui/turn-keys.js` owns the ADR-0003
stdout lease, and its transition is the last renderer still doing everything the
hard way:

| Fact | Site | Symptom |
|------|------|---------|
| F1 | `interceptedWrite()` (`turn-keys.js:260-269`) runs a full transition on **every** `process.stdout.write` — the spinner alone writes every 80 ms (`spinner.js:12,70`), deltas arrive at 50–100/s | 12–100 full erase+redraw cycles per second |
| F2 | `hideFrame()` (`:171-181`) ends with `'\r\x1B[0J\x1B8'` | `ESC[0J` erases from the frame top **to the end of the screen** on every repaint — the whole-terminal blink |
| F3 | `drawFrame()` (`:117-169`) reserves rows with `'\n'.repeat(reserveRows)` unconditionally | a **screen scroll** on every repaint when the cursor is near the bottom |
| F4 | `repaint()` (`:252-255`) has no early-out | a byte-identical frame is erased and redrawn for nothing |
| F5 | `turn-keys.js` never imports `commit-frontier.js` | the `hide → chunk → draw` sequence is three separate writes, so the terminal sees every intermediate state (erased frame without redraw, frame without caret) |

P1-14 Stage A removed the duplication family and wrapped two paths, but its
deviation note ("the frame is already atomic under the lease") is true per
*write*, not per *transition* — and P1-16 is the piece the user sees daily.

## 2. Goal

Every frame transition the active-turn lease performs is **one synchronized
update** (`ESC[?2026h`/`l`), erases **only the frame's own rows** (never
`ESC[0J`), coalesces a burst of agent writes into at most one redraw per event-loop
turn, and emits nothing at all when the frame on screen is byte-identical — so no
intermediate or redundant state is ever presented.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-----------|---------------------|
| RF-S01 | The whole `erase → agent chunk(s) → repaint` region of `interceptedWrite` is wrapped in ONE DEC 2026 pair, decided once per transition by `shouldEmitSynchronizedOutput()` from `ui/commit-frontier.js` (tmux exception + TTY guard included, never hand-rolled). | Must |
| RF-S02 | A frame hide erases only the rows the frame itself occupies: climb to the frame's top (clamped), clear each of its own rows with `ESC[K` while stepping with `ESC[1B` (which cannot scroll), then restore the agent's saved output row. Agent output lives above the frame's top row and must never be inside the erased region. | Must |
| RF-S03 | A burst of agent writes inside one event-loop turn produces exactly one transition: one erase, one redraw, one marker pair. The agent's bytes are still written **before** the redraw, and a keypress settles any owed redraw before it acts on the draft. | Must |
| RF-S04 | A byte-identical frame that is still on screen is never re-emitted and never erased just to be redrawn. | Must |
| RF-S05 | The row reservation of RF-03/F3 is emitted only when the redraw is **not** provably landing on the rows the frame just vacated; when it cannot be proven, the pre-existing reservation is kept (a scroll between `ESC7` and `ESC8` makes `ESC8` restore into the frame). | Must |
| RF-S06 | The persistent prompt's `eraseChunk()` obeys the same bounded-erase rule (no `ESC[0J` anywhere in `src/ui/`). | Must |
| RF-S07 | On a non-TTY stdout the transition emits nothing at all (no marker, no cursor escape); with `$TMUX` set it emits no marker. | Must |
| RF-S08 | The four UI suites keep their counts and pass; the full suite exits 0; lint 0 errors. | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|----------|
| **Risk classification** | **Medium** — every changed file renders to the terminal under the stdout lease. No command execution, no file writes, no paths, no credentials. The worst case is a mis-drawn frame, self-corrected by the next transition (all geometry is relative to the caret). |
| **Assets/secrets** | Not applicable — no credential, session or memory surface; nothing persisted. |
| **Command execution / file writes** | Not applicable — no `runCommand`, no handler, no file write; safe mode/dry-run/whitelist/`resolveSafePath` untouched. |
| **Untrusted inputs** | Unchanged: the frame window is built from the draft (already sanitized when queued) and appended escapes are fixed literals. The agent's chunk is inspected only to COUNT rows it moves (newlines, `ESC[nB`) — never parsed, never reflected. |
| **Negative criteria** | Never `ESC[0J` (or any erase that reaches outside the frame's own rows); never a synchronized marker when the terminal is tmux-backed or the stdout is not a TTY; never an unterminated synchronized update (every open is closed in a `finally`/settle path); never a climb larger than `rows - 1`; never a behaviour change to the draft, the layout budget, the clamp rules or the caret math. |

## 5. Out of Scope

- `model-picker.js`'s row-by-row frame: **reported**, not restructured (Step 6 of the brief).
- Re-doing Stage A work: the commit frontier, the shared clamp, the persistent prompt's wrapper, the finalized-block commits.
- P1-14 Stage B (paste chip, foldable thinking) and Stage C (status line, diff, per-request cache hit).
- The thinking stream's append-only latch, the prompt's paste-burst coalescing, the `shutdown()` handle, `agent.js`/provider behaviour.
- Absolute cursor-row tracking (a DSR query): emile deliberately never issues one, which is why RF-S05 is a *proof* rather than a formula (see § 7).

## 6. Acceptance Criteria

- **AC-01:** Given a turn with the frame visible, when 50 agent writes happen inside one event-loop turn, then exactly ONE `ESC[?2026h`/`ESC[?2026l` pair and at most ONE full frame draw are emitted.
- **AC-02:** Given any frame hide (agent write, keypress repaint, cleanup), then the emitted bytes contain no `ESC[0J`, and the erase clears exactly the frame's own rows (one `ESC[K` per row the frame drew, stepped with `ESC[1B`).
- **AC-03:** Given a frame that is on screen and whose payload did not change, when it is repainted, then no bytes are emitted (nothing is erased and nothing is re-emitted).
- **AC-04:** Given `$TMUX` set (or a non-TTY stdout), when a transition happens, then no `2026` marker is emitted; on a non-TTY stdout no cursor escape at all is emitted.
- **AC-05:** Given an in-place redraw (the agent's chunk moved the cursor down by zero rows and the frame did not grow), then the `'\n'.repeat()` row reservation is NOT emitted; given a redraw that cannot be proven in place, the reservation is kept.
- **AC-06:** Given `npm test`, then `prompt-input-render` keeps or grows its count, `thinking-stream-append` (9), `turn-input-cap` (14), `thinking-during-active-turn` (1) and `turn-keys-visibility` (5) stay green, the suite exits 0 and `npm run lint` reports 0 errors.
- **AC-07:** Given the change, then CHANGELOG, `docs/architecture.md`, `docs/deep-dive.md` § 6/§ 19/§ 21.1 and `features/terminal-ui.md` describe it.

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|---------|--------------------|
| **The brief's reservation formula (`lastTopOffset + layout.height > rows`) is not a safe proxy** and is therefore **not** implemented verbatim. | Skipping the reservation exactly while streaming at the bottom of the screen risks `ESC8` drift (the next agent chunk overwriting the frame). | Worked example in the plan § 11: `rows = 24`, previous frame on rows 19–23, one-line chunk ⇒ `A' = 19`, the frame draws to row 24 and scrolls, while the formula would have said "fits" (2+5 = 7 ≤ 24). The implemented rule skips the reservation only when the redraw is *provably* in place (chunk moved no rows, frame did not grow ⇒ the frame lands on rows it just vacated, which were on screen). Deviation recorded in the plan and the handoff. |
| The flicker itself cannot be asserted in CI. | The ACs would be unfalsifiable. | The proxy assertions are the marker count, the absence of `ESC[0J`, the erase step count and the unchanged-frame no-op — each is a necessary condition of "no intermediate state was presented"; the spec states this limitation explicitly. |
| Coalescing delays a redraw by one event-loop turn. | If the process exits with a redraw owed, the frame could stay erased. | Every settle path is synchronous (`cleanup()` settles before releasing the lease), the pending handle is `unref`'d, and the agent's own bytes are never delayed (only the frame redraw). |
| The emulators in `turn-keys-visibility` and `thinking-during-active-turn` cannot consume `ESC[?2026h` (their CSI regex rejects `?`). | The must-stay-green suites would fail on leaked marker text. | Both emulators learn the private-mode pair (exactly what Stage A did to the render emulator); the render emulator also learns `ESC[1B`, which the new bounded erase uses. Harness faithfulness, not a weakened assertion. |
| `turn-keys-visibility` asserts one redraw **per write**. | Its count assertion contradicts coalescing. | The test's timing assumption is updated to the new contract while its invariants are strengthened (each agent line exactly once, one frame draw per turn, caret on the draft row). Reported, not silently relaxed. |

## 8. References

- Product/architecture documents consulted: `docs/architecture.md` (ui/ row + ADR-0003 arbitration), `docs/visual-identity.md` (vertical rhythm/block vocabulary), `docs/deep-dive.md` § 6 (§ 6.1/§ 6.2 the three renderers and the stdout lease), § 19 (UI design system), § 21.1 (P1-16), `docs/adr/0003`, `.clinerules` Rules 2–9.
- Brief: `specs/2026-10-08-deep-dive-backlog/briefs/p1-16-streaming-flicker.md`.
- Reference (grok-build, verified 2026-10-10): `crates/codegen/xai-grok-pager-render/src/render/draw.rs:500-516` (one synchronized decision per frame, markers at `:750-751`) and `crates/codegen/xai-grok-pager-render/src/terminal/tmux.rs:50-57` (the tmux exception); `crates/codegen/xai-ratatui-inline/src/terminal.rs:661-687,802-858` (emission limited to the region the viewport owns).
- Related specs: `specs/2026-10-10-ui-commit-frontier` (Stage A — the wrapper, the clamp, the frame budget), `specs/2026-10-09-paste-burst-redraw` (the burst-coalescing precedent reused by RF-S03).