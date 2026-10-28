# Spec: UI commit frontier and viewport-budgeted prompt frame

| Field | Value |
|-------|-------|
| **ID** | `2026-10-10-ui-commit-frontier` |
| **Status** | `implemented` |
| **Phase/Context** | Wave 2 — UI foundation (deep-dive backlog P1-14, Stage A) |
| **Related documents** | [deep-dive § 7/§ 19/§ 22.2](../../docs/deep-dive.md), [architecture](../../docs/architecture.md), [visual identity](../../docs/visual-identity.md), [ADR-0001 (tech stack)](../../docs/adr/0001-tech-stack-choice.md), [ADR-0003 (stdout arbitration)](../../docs/adr/0003-active-prompt-output-arbitration.md) |

---

## 1. Problem / Motivation

Three defects of the same family shipped in one session: the live thinking stream
duplicated itself (P0-1, § 7.2), a large paste duplicated the whole prompt block
(P0-4, § 22.2), and a tall paste left a partial "cut" frame on screen after
submit (P2-18, the "prompt cortado" capture). All three are the same root cause:
**erase-and-redraw of a mutable block whose top can scroll out of reach** — an
`ESC[nA` cannot travel past the viewport, so the rows that scrolled into the
scrollback keep the previous frame, and every later repaint draws the block
again below it.

P0-1 and P0-4 clamped the damage (shared clamp in `src/ui/terminal-cursor.js`).
Clamping bounds the damage but leaves the class open: any renderer that still
repaints a mutable block taller than the terminal can re-introduce it, and four
call sites still emit an unbounded `ESC[nA`.

## 2. Goal

Make the class structurally impossible, the way the reference pager
(grok-build) does: **finalized output is committed once into the terminal's own
scrollback and never repainted**, and **the live prompt owns a frame whose height
is budgeted by `stdout.rows`**, so the drawn block can always reach its own top.
This subsumes P2-18 (block height budget) and P2-19 (the remaining uncapped
cursor-up sites).

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-----------|---------------------|
| RF-S01 | A new `src/ui/commit-frontier.js` implements the print-once rule: a committed block is written once with a trailing newline and never re-emitted; a failed write leaves the block uncommitted so the next commit retries it; the module only ever appends (never erases or climbs). | Must |
| RF-S02 | The committed rows exceeding the live region (`stdout.rows - 1`) are released to the terminal (scroll), never erased. | Must |
| RF-S03 | A closed thinking block, a finished tool grid and a completed assistant response are emitted through the frontier (one write, one trailing newline) instead of per-line writes. | Must |
| RF-S04 | `buildPromptLayout` accepts `maxRows`; when the draft does not fit, it renders a window of input rows around the cursor row with dim elision markers (`⌃ N earlier rows` / `⌄ N later rows`) and always keeps the cursor row inside the window. | Must |
| RF-S05 | The prompt caller derives `maxRows` from the live `stdout.rows` on every render (resize is normal), so the drawn block never exceeds `stdout.rows - 1` rows for any terminal with `rows >= 6`. | Must |
| RF-S06 | No path in `src/ui/` emits an `ESC[nA` larger than `rows - 1`, and no cursor-up at all on a non-TTY stdout. | Must |
| RF-S07 | Multi-row writes are wrapped in DEC 2026 synchronized output (`ESC[?2026h` / `ESC[?2026l`), skipping the wrapper when tmux is the immediate terminal (`$TMUX`). | Must |
| RF-S08 | The four existing UI suites keep their current counts and pass; the full suite exits 0. | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|----------|
| **Risk classification** | **Medium** — every changed file renders to the terminal. No command execution, no file writes, no paths, no credentials. The worst case is a broken screen, never data loss: the submitted draft is never rewritten by this change. |
| **Assets/secrets** | Not applicable — no credential, session or memory surface is touched; nothing new is persisted. |
| **Command execution / file writes** | Not applicable — no `runCommand`, no handler and no file write is involved. Safe mode, dry-run, the whitelist and `resolveSafePath` are untouched. |
| **Untrusted inputs** | The draft text and the model output already reach the terminal through the existing sanitizers; the new code only *windows* and *wraps* strings that were already sanitized and clipped (`clipLine`, `sanitizeAssistantOutput`, `stripTerminalControls`). `commit()` interpolates nothing into an escape: the wrapper is a fixed literal pair. |
| **Negative criteria** | The frontier must never emit an erase (`ESC[nJ`, `ESC[K`) or a cursor-up; the layout must never yield more than `maxRows` rows; a non-TTY stdout must receive neither a cursor-up nor the synchronized wrapper; `$TMUX` must suppress the wrapper. |

## 5. Out of Scope

- **Stage B** of P1-14: the `[Pasted: N lines]` chip and the foldable thinking modes (`ctrl+e`).
- **Stage C** of P1-14: status-line parity, diff rendering, the per-request cache hit.
- `thinking.js`'s append-only latch (P0-1) and its already-clamped climbs (`thinking.js:204, 224, 265`) — untouched.
- The paste-burst coalescing (P0-4) and the prompt `shutdown()` handle (P1-15) — untouched.
- `agent.js`, `response.js` content logic, provider/API behaviour, session persistence.
- A literal port of the Rust reference (a sidecar pager or a Rust TUI inside emile): ADR-level, not improvised here (see § 7).

## 6. Acceptance Criteria

- **AC-01:** Given a frontier, when a block with an id is committed and the same id is committed again, then the block reaches `write` exactly once (print-once).
- **AC-02:** Given a frontier whose `write` throws, when the block is committed and a later commit runs with a working `write`, then the first commit returns `false` and leaves the block uncommitted (`pendingCount() === 1`), and the retry emits it exactly once.
- **AC-03:** Given committed rows that exceed `stdout.rows - 1`, when they are committed, then the overflow is counted as released to the terminal and no erase or cursor-up escape is emitted (`rows` is honoured).
- **AC-04:** Given `buildPromptLayout({ maxRows })`, when the draft is far taller than the budget, then `lines.length <= maxRows`, the cursor row is inside the drawn window, and the elision counts (`elidedEarlier`/`elidedLater`) match the markers actually printed.
- **AC-05:** Given the persistent prompt on a terminal with `rows = 24` and a 200-line draft, when the frame is drawn, then the block is at most 23 rows and the erase can reach its top (no remnant); on `rows = 8` the block is at most 7 rows and nothing crashes.
- **AC-06:** Given any `src/ui/` renderer, when it emits a cursor-up, then the distance is at most `stdout.rows - 1`; on a non-TTY stdout no `ESC[nA` is emitted at all.
- **AC-07:** Given a TTY without `$TMUX`, when a multi-row block is committed, then the write is wrapped in `ESC[?2026h`/`ESC[?2026l`; with `$TMUX` set (or on a non-TTY stdout) the markers are absent.
- **AC-08:** Given `npm test`, then the four UI suites keep their counts (`prompt-input-render` ≥ 20, `thinking-stream-append` 9, `turn-input-cap` 14, `thinking-during-active-turn` 1) and the suite exits 0; `npm run lint` reports 0 errors.
- **AC-09:** Given the change, then CHANGELOG, `docs/architecture.md`, `docs/visual-identity.md`, `docs/deep-dive.md` and `features/terminal-ui.md` describe it.

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|---------|--------------------|
| Literal reference reuse is impossible (Rust vs ES modules, ADR-0001). | A "port" could silently be an invention. | Each mechanism cites the reference `file:line` (F6) and the spec records where the port is an analogue, not a copy — see the plan § 2. |
| emile has no scrollback block model, so the reference's commit *scan cursor* over an entry list has no analogue. | Print-once needs a block identity. | The frontier is keyed by an explicit block id supplied by the caller; the one block a caller may finalize twice (the thinking stream) passes `thinking:<stream>`, every one-shot block lets the frontier allocate an id. Recorded as the deliberate difference. |
| Windowing a tall draft hides text the user is editing. | UX regression. | The window is centered on the cursor, markers report the hidden counts, and the draft itself is never modified — only its rendering is windowed. |
| A tiny terminal (rows < 6) cannot hold borders + a marker + one input row. | The "≤ rows - 1" invariant is unreachable there. | Documented degraded mode: the footer is dropped, then the menu shrinks; below 6 rows the block is the physical minimum and the shared clamp still contains it (no new failure mode). |
| Wrapping frames in DEC 2026 could confuse terminals that do not implement it. | Visual artifacts on old terminals. | The markers are universally ignored by non-supporting terminals (they are private-mode sequences), and the reference ships them by default. |

## 8. References

- Product/architecture documents consulted: `docs/architecture.md` (ui/ row), `docs/visual-identity.md` (block vocabulary), `docs/code-quality-and-security.md` (risk classification), `docs/deep-dive.md` § 7, § 19, § 22.2, `docs/adr/0001`, `docs/adr/0003`, `.clinerules` Rules 2–9.
- Brief: `specs/2026-10-08-deep-dive-backlog/briefs/p1-14-ui-foundation-from-grok-build.md` (Stage A), `.../p2-18-prompt-viewport-layout.md`, `.../p2-19-cursor-up-clamp-remaining.md`.
- Reference (verified 2026-10-10 against `C:\Users\mc33p\Documents\GitHub\grok-build`): `crates/codegen/xai-grok-pager-minimal/src/commit.rs:145-168`, `crates/codegen/xai-ratatui-inline/src/terminal.rs:661-687` and `:802-858` (and `:692-733` for `set_viewport_height`, which lives in *this* file, not `xai-grok-pager/src/app/mod.rs`), `crates/codegen/xai-grok-pager/src/views/agent.rs:423-429`, `crates/codegen/xai-grok-pager-render/src/render/draw.rs:500-516` (`BEGIN`/`END` at `:750-751`, tmux exception documented at `:38` and implemented in `xai-grok-pager-render/src/terminal/tmux.rs:50-57`).
- Related specs: `specs/2026-10-09-paste-burst-redraw`, `specs/2026-10-10-thinking-append-only`, `specs/2026-10-10-turn-input-cap`.