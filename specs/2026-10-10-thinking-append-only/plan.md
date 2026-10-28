# Plan: Thinking stream renders append-only with a viewport-clamped erase

> Filled from the approved `spec.md`. The design is fixed by brief P0-1 and is
> not re-derived here; this document records how it lands.

| Field | Value |
|-------|-------|
| **Spec** | `2026-10-10-thinking-append-only` |
| **Status** | `implemented` |

> **Implementation note (deviation, recorded after the fact):** § 1.2 originally
> routed the in-place climb through `writeCursorUp(oldTotal)`, as the brief
> prescribed. That broke the lease-aware active-turn test: under the ADR-0003
> stdout lease each `write` is wrapped by hide→write→repaint, so a cursor-up
> emitted on its own is erased before the frame it belongs to arrives. The clamp
> is now **computed** via the shared `clampedCursorUp()` and embedded in the
> frame's single `write`; `writeCursorUp` remains for callers whose erase is a
> step of its own (the persistent prompt). Same clamp, atomic frame — see
> `tasks.md` T1.8 and the spec's § 7 risk table.

---

## 1. Technical Approach

Three files: one tiny extraction, one rewritten renderer, one new test suite.

### 1.1 Extract the shared clamp (pure move, Step 2)

New `src/ui/terminal-cursor.js` receives, **verbatim**, the two module-local
helpers P0-4 added to `prompt-input-persistent.js` (comments included):

```js
export function viewportCursorUp() {
  return Math.max((process.stdout.rows || 24) - 1, 0);
}
export function writeCursorUp(rows) {
  if (!process.stdout.isTTY || rows <= 0) return;
  const up = Math.min(rows, viewportCursorUp());
  if (up > 0) process.stdout.write(`\x1B[${up}A`);
}
```

`prompt-input-persistent.js` deletes the local copies and imports them. That file
is otherwise untouched — the 20 render tests are the proof (AC-06).

### 1.2 Append-only thinking (Step 3)

New per-stream state alongside the existing ones:

| State | Meaning |
|-------|---------|
| `_flushedLineCount` | number of wrapped lines already emitted **with** a trailing `\n` |
| `_openTailWritten` | whether the newest line is currently displayed **without** a trailing `\n` (the "open tail") |
| `_appendOnly` | per-stream latch, set the first time the block cannot fit (or stdout is not a TTY) |

`appendThinkingStream(delta)` recomputes `newLines` exactly as today (same wrap
math, same `innerW = Math.max(cols - 4, 40)`), then branches:

**In-place path** — only while `process.stdout.isTTY && !_appendOnly &&
(_thinkingHeaderLineCount + newLines.length <= Math.max((process.stdout.rows || 50) - 2, 1))`.
Identical emission to today (header + every line, `\r\x1B[K` prefixes, shrink
handling), except that **both** cursor-ups (the climb to the block top and the
shrink recovery) go through `writeCursorUp`, which is a no-op clamp while the
block fits and a hard bound otherwise (RF-S03).

**Append-only path** — latches `_appendOnly = true` (never released for that
stream) and emits only the suffix:

```js
let out = '';
if (_openTailWritten) {
  // The cursor sits on the open tail, which is wrapped line index _flushedLineCount.
  out += '\r\x1B[K' + '  ' + C.muted(newLines[tailIndex]);
  if (newLines.length - 1 > _flushedLineCount) out += '\n';   // that line is now closed
}
for (let i = start; i < newLines.length; i++) {
  out += i === newLines.length - 1
    ? '  ' + C.muted(newLines[i])                     // new open tail: no \n
    : '  ' + C.muted(newLines[i]) + '\n';             // closed line
}
_flushedLineCount = newLines.length - 1;              // monotone: never rewinds
_openTailWritten = true;
```

`tailIndex = Math.min(_flushedLineCount, newLines.length - 1)` guards the rare
shrink case (cumulative-snapshot dedup), so the flush cursor can never rewind or
index out of range → no duplicated text (spec § 7 risk 5). No cursor-up is
emitted in this mode at all.

`endThinkingStream()`:

- **append-only or non-TTY**: no climb (the header may have scrolled). Close the
  open tail with `\n` when one is open, then append the fresh one-line footer
  `  ✻ Thought for Ns`.
- **otherwise**: today's header rewrite, with `writeCursorUp(totalLines)`.
- **collapsed**: untouched (RF-S08).

`startThinkingStream` and `endThinkingStream` both reset `_flushedLineCount`,
`_openTailWritten` and `_appendOnly`, so a second stream in the same process
starts clean (RF-S12).

`debugWrite` wraps every emission as before (RF-S10); `printThinking` is not
touched.

## 2. Architectural Compliance

- **Relevant ADR(s):** ADR-0001 (pure ESM, no dependency) — respected.
  ADR-0002 (quality gates) — new dedicated suite + standard gates.
  ADR-0003 (active-prompt stdout arbitration) — respected: the module keeps
  writing through the lease; the change reduces the number of frame invalidations
  for long streams rather than adding an absolute-position assumption.
- **Architecture document:** `docs/architecture.md` § 2 `ui/` row stays true — its
  golden rule ("thinking and prompt redraws assemble complete bounded frames")
  still holds: every frame emitted is bounded and clipped, and the clamp is now
  shared. One clause is added to name `terminal-cursor.js` in the module list.
- **Design system:** `docs/visual-identity.md` — the muted/ghost styling, the
  two-space indent, the `✻`/`···` vocabulary and the vertical rhythm are
  unchanged; only *how often* a block is repainted changes.

## 3. Security and Threat Model

| Element | Handling |
|----------|------------|
| Command execution and whitelist | Not applicable — no tool path touched. |
| File writes and `resolveSafePath` | Not applicable — the module writes to stdout only. |
| LLM inputs (prompt injection / tool args) | Reasoning deltas are untrusted provider output; they are wrapped and muted through the existing path and never executed or parsed for control flow. |
| Secrets (API keys, sessions, exports) | No new output or logging; the `EMILE_DEBUG_THINKING` trace stays opt-in and unchanged. |
| Controls and negative criteria | AC-01/02/03 are the "no unbounded escape and no second copy" checks; AC-04 is the "did not degrade the good path" check; AC-05 pins collapsed output; AC-06 pins the pure-move extraction. |

## 4. Impacted Modules

| Module | Path | Change |
|--------|---------|---------|
| UI — terminal cursor | `src/ui/terminal-cursor.js` | **New**: the shared viewport clamp (moved verbatim). |
| UI — thinking stream | `src/ui/thinking.js` | Append-only emission, fit check, per-stream latch, clamped in-place path, append-safe end. |
| UI — persistent prompt | `src/ui/prompt-input-persistent.js` | Local clamp removed; imports the shared one. No behaviour change. |
| Tests | `test/thinking-stream-append.test.js` | New: capture-only harness, cases A–E + state reset. |

## 5. Impacted Flags / Slash Commands / Tools

| Type | Name | Change |
|------|------|--------|
| CLI flag | — | none |
| Slash command | `/thinking`, Ctrl+P | behaviour only: the expanded stream is now emitted once instead of re-painted |
| Env var | `EMILE_DEBUG_THINKING` | unchanged (still logs every emission) |
| Tool / MCP | — | none |

## 6. Files to Create/Modify

| Action | Path | Notes |
|------|--------|-------|
| Create | `specs/2026-10-10-thinking-append-only/spec.md` | this spec |
| Create | `specs/2026-10-10-thinking-append-only/plan.md` | this plan |
| Create | `specs/2026-10-10-thinking-append-only/tasks.md` | tasks + verification log |
| Create | `src/ui/terminal-cursor.js` | shared clamp |
| Create | `test/thinking-stream-append.test.js` | cases A–E + reset |
| Modify | `src/ui/thinking.js` | append-only renderer |
| Modify | `src/ui/prompt-input-persistent.js` | import the shared clamp |
| Modify | `CHANGELOG.md` | `[Unreleased] → Fixed` |
| Modify | `docs/deep-dive.md` | § 7.4 applied, § 21.1 P0-1 applied, § 20 row |
| Modify | `features/terminal-ui.md` | Change History row + the redraw/streaming technical row |
| Modify | `docs/architecture.md` | `ui/` module list names `terminal-cursor.js` |

## 7. Technical Decisions (summary)

1. **Extract rather than duplicate the clamp.** P0-4 already produced the exact
   primitive; a second copy would drift. The move is verbatim and covered by the
   existing 20 render tests (the brief's explicit constraint).
2. **Latch, don't re-evaluate.** Once a block has scrolled, no later delta can
   make erasing safe again, so `_appendOnly` is sticky for the stream. This is
   the "print-once commit boundary" discipline from deep-dive § 22.1.
3. **Open-tail strategy** rather than "print only complete lines": the newest
   wrapped line is still growing as deltas arrive, so it is displayed without
   `\n` and rewritten in place with `\r\x1B[K` on the next delta. One row
   rewritten in place is always safe, even after a scroll.
4. **Fit check uses `rows || 50` while the clamp uses `rows || 24`.** The fit
   check is a conservative heuristic (leave two rows of headroom); the clamp is
   the hard safety net. Deliberately independent, per the brief.
5. **Monotone flush cursor.** Shrinking derived state is clamped instead of
   rewound, so append-only can never re-emit a line it already printed — the
   acceptance criterion the whole change exists for.
6. **The end footer is a fresh line, not a header rewrite**, when the header may
   have scrolled: the user still gets the `✻ Thought for Ns` summary without an
   unsafe climb.
7. **No cursor-up at all in append-only mode.** Even a `\x1B[1A` is unnecessary
   once the open tail is the line under the cursor.

## 8. Verification Strategy and Gates

| AC | Check |
|----|---------|
| AC-01 | Case A: `isTTY = false`, 30 deltas of a 200+ line stream with `APPEND_ONLY_MARKER_XYZ`; count marker occurrences in the raw writes (exactly 1) and parse every `ESC[nA` (all `n ≤ 1`). |
| AC-02 | Case B: same feed with `isTTY = true`, `rows = 24`; marker once; all `ESC[nA` with `n ≤ 23`, including the writes produced by `endThinkingStream`. |
| AC-03 | Case C: over-viewport block + `endThinkingStream()` → no over-clamp climb, tail closed, footer present. |
| AC-04 | Case D: short stream → text once **and** `ESC[nA` sequences present (in-place path used). |
| AC-05 | Case E: `config.expandThinking = false` → exactly the ghost start line and the `··· thought Ns` close. |
| AC-06 | `node --test test/prompt-input-render.test.js` (20/20) and `test/thinking-during-active-turn.test.js`. |
| AC-07 | `node --check` ×3, `node --test` new + render suites, `npm run lint`, `npm test` (exit 0). |
| AC-08 | A test that runs two consecutive streams through the same process state and asserts the second one starts on the in-place path when it fits. |
| AC-09 | Docs diff review + Rule 5 table validation. |

Commands (Rule 6.3): `node --check src/ui/thinking.js src/ui/terminal-cursor.js
src/ui/prompt-input-persistent.js`; `node --test
test/thinking-stream-append.test.js test/prompt-input-render.test.js`; `npm run
lint`; `npm test`. Smoke: the interactive `node bin/emile.js --verbose` path
needs a live reasoning model, so the marker-count suite plus the lease-aware
active-turn test stand in; recorded in `tasks.md`.

## 9. Git Workflow

| Item | Answer |
|------|--------|
| **Working branch** | `development` (confirmed by `git branch --show-current`); no switch/branch/worktree (Rule 8). |
| **Commit plan** | One coherent unit: spec pack + shared helper + `thinking.js` + tests + docs, staged with explicit paths (never `git add .`/`-A`). |

## 10. Failures, Partial State and Rollback

| Topic | Strategy |
|------|------------|
| Error handling and user-facing messages | No new message. A stream that ends mid-line still gets its tail closed plus the footer. |
| Interruption (Ctrl+C / Esc) and turn state | The module holds no stdin and no raw mode; cancellation flows through `agent.js` unchanged. |
| Partial state | All state is module-local and reset at both stream boundaries (RF-S12); a cancelled stream leaves at most one open tail, which the next `printThinking`/box write lands after. |
| Rollback / undo | Revert the commit — no migration, no persisted state, no config change. |

## 11. Technical Risks and Trade-offs

| Risk | Likelihood | Mitigation |
|-------|---------------|-----------|
| A word that wraps onto a new row after the open tail was written leaves one stale row above. | Low | The open tail is rewritten in place on the next delta; the artifact is bounded to one row and never duplicates a thought. |
| `process.stdout.rows` is absent on some TTYs. | Medium | Fit check falls back to 50, the clamp to 24 — both conservative; a wrong guess degrades to append-only (correct output) rather than to a redraw. |
| Copying the "open tail" model into the shrink case. | Low | Monotone cursor + clamped tail index; covered by a dedicated assertion in the suite. |
| The extraction silently changes prompt behaviour. | Low | Verbatim move; the 20 render tests are the gate and are not edited. |