# Plan: Large-paste duplication fix — coalesce the paste burst, clamp the prompt redraw

> Filled from the approved `spec.md` of the same folder. The design was fixed by
> brief P0-4 and is not re-derived here; this document records how it lands.

| Field | Value |
|-------|-------|
| **Spec** | `2026-10-09-paste-burst-redraw` |
| **Status** | `implemented` |

---

## 1. Technical Approach

Three surgical changes inside `src/ui/prompt-input-persistent.js`, all local to
`persistentPromptInput` plus two small module-level helpers. No new module, no
new dependency, no public API change.

1. **Render arbitration inside the prompt (single chokepoint).** Instead of
   sprinkling `if (isPasting)` guards across the keypress branches, the deferral
   decision lives in `render()` itself, which is the only function that draws:

   ```js
   function render() {
     if (busy?.isBusy() || submitInFlight) return;          // unchanged: agent owns the area
     if (isPasting || burstDeferred) { renderDeferred = true; return; }  // NEW: coalesce
     renderDeferred = false;
     clearBurstFlush();
     /* …existing draw… */
   }
   ```

   Every existing branch keeps calling `render()`; inside a burst the call is
   recorded as owed and dropped. `paste-end` calls `render()` once, after
   `isPasting` is cleared, so the owed frame is the single full-block redraw.

2. **Burst detection for non-bracketed terminals** (grok `event_loop.rs:3610-3710`
   pattern, F6). A run of ≥3 *pasteable* keypresses whose gaps are ≤2 ms is one
   paste. Node delivers a paste as a synchronous run of `keypress` events inside
   one stdin read, so a `Date.now()` gap test is enough — no worker, no stream
   parsing:

   ```js
   const PASTE_BURST_WINDOW_MS = 2;   // ≥3 keys inside this gap = a paste, not a typist
   const PASTE_BURST_QUIET_MS = 10;   // flush once the burst goes quiet
   const PASTE_BURST_MIN_KEYS = 3;
   ```

   `trackPasteBurst(str, key)` runs at the top of `onKeypress` (except for the
   bracketed markers). Text keys increment the run counter; reaching the
   threshold flips `burstDeferred` and re-arms a 10 ms quiet timer. Any
   non-pasteable key ends the burst immediately (`endBurst()`), which draws the
   owed frame **before** the key is handled — so backspace/Tab/arrow/Enter always
   operate on a screen that matches the draft.

   **Pasteable = text-producing only.** The denylist mirrors the branches that
   are not the text branch: `return`/`enter`, `backspace`, `delete`, `left`,
   `right`, `up`, `down`, `tab`, `escape`, any `ctrl`/`meta` combo and
   Shift+Enter. Enter is deliberately excluded so a burst can never swallow a
   deliberate submit (RF-S08, spec § 7 risk 3).

3. **Viewport-clamped cursor-up.** Two module-level helpers, used by both the
   erase and the reposition:

   ```js
   function viewportCursorUp() { return Math.max((process.stdout.rows || 24) - 1, 0); }
   function writeCursorUp(rows) {
     if (!process.stdout.isTTY || rows <= 0) return;
     const up = Math.min(rows, viewportCursorUp());
     if (up > 0) process.stdout.write(`\x1B[${up}A`);
   }
   ```

   `erasePreviousBlock()` and `render()` (the `rowsUp` reposition) go through it.
   The clamp is provably a no-op while the block fits the viewport (`lastTopOffset
   < block height ≤ rows`), so the erase math keeps working exactly as before for
   every current test; it only kicks in when the block is taller than the
   viewport, where an over-long cursor-up cannot reach scrolled lines anyway.
   Height overflow then degrades to scroll — never to duplication.

## 2. Architectural Compliance

- **Relevant ADR(s):** ADR-0001 (pure ESM, no new dependency — respected: zero
  dependencies added). ADR-0003 (active-prompt output arbitration) — respected:
  the busy/in-flight early-return in `render()` is untouched and still decides who
  owns the output area; the new deferral is a *lower-priority* condition inside the
  same chokepoint. ADR-0002 (quality gates) — lint + `node --test` gates applied.
  No new ADR needed: nothing about the stack, module boundaries or contract changed.
- **Architecture document:** `src/ui/` still owns all rendering
  (Rule 4.3); `docs/architecture.md` module table is unchanged (no module added,
  moved or re-responsibilized).
- **Visual identity:** `docs/visual-identity.md` § Input prompt — the block, its
  borders, the `❯`/`●` distinction, the per-row clipping and the caret position are
  unchanged; only the *frequency* of redraws changes. One sentence documenting the
  paste coalescing is added to that row (Rule 2).

## 3. Security and Threat Model

| Element | Handling |
|----------|------------|
| Command execution and whitelist | Not applicable — no `runCommand`, no tool handler touched. |
| File writes and `resolveSafePath` | Not applicable — the module never writes files. |
| LLM inputs (prompt injection / tool args) | Not applicable to this path; the draft is user input. Pasted text remains **data**: the burst detector inspects keypress metadata only, and the payload still flows through the existing `onSubmit` boundary untouched. |
| Secrets (API keys, sessions, exports) | Nothing new is echoed, logged or persisted. `EMILE_DEBUG_RENDER` (opt-in stderr trace of the draft) is unchanged; no new trace is added. |
| Controls and negative tests | Negative criteria from spec § 4 enforced by tests: no `ESC[nA` above `rows-1` (AC-03), none at all on non-TTY (AC-04), no submit from a burst (AC-05), no render inside a bracketed paste beyond the single `paste-end` frame (AC-01), no timer surviving cleanup (AC-07). |

## 4. Impacted Modules

| Module | Path | Change |
|--------|---------|---------|
| UI — persistent prompt | `src/ui/prompt-input-persistent.js` | Paste-burst coalescing + render arbitration + viewport-clamped cursor-up. Exports unchanged. |
| Tests — render harness | `test/prompt-input-render.test.js` | Harness pins `isTTY`/`rows`; 4 new cases (bracketed, burst, rows clamp, non-TTY). |
| UI — active-turn frame (report only) | `src/ui/turn-keys.js` | **Not changed.** Same uncapped pattern at `:73`, `:78`, `:91`. |

## 5. Impacted Flags / Slash Commands / Tools

| Type | Name | Change |
|------|------|--------|
| CLI flag | — | none |
| Slash command | — | none |
| Tool | — | none |
| MCP | — | none |
| Env var | `EMILE_DEBUG_RENDER` | unchanged (diagnostic trace still fires per keypress/render attempt) |

## 6. Files to Create/Modify

| Action | Path | Notes |
|------|--------|-------------|
| Create | `specs/2026-10-09-paste-burst-redraw/spec.md` | this spec |
| Create | `specs/2026-10-09-paste-burst-redraw/plan.md` | this plan |
| Create | `specs/2026-10-09-paste-burst-redraw/tasks.md` | task list + verification log |
| Modify | `src/ui/prompt-input-persistent.js` | constants + 2 helpers + `render`/`erasePreviousBlock`/`onKeypress`/`shutdown` |
| Modify | `test/prompt-input-render.test.js` | harness `isTTY`/`rows` + Cases A–D (new burst tests) |
| Modify | `CHANGELOG.md` | `[Unreleased] → Fixed` entry |
| Modify | `docs/deep-dive.md` | § 22.2 marked applied, § 20 pattern row, § 21.1 P0-4 row |
| Modify | `features/terminal-ui.md` | Change History row + technical-details row |
| Modify | `docs/visual-identity.md` | Input prompt row: paste coalescing + clamped cursor-up |

## 7. Technical Decisions (summary)

1. **Deferral lives in `render()`, not in each keypress branch.** One chokepoint,
   no chance of a branch forgetting the guard, and the branch code stays as it is.
2. **A `renderDeferred` "owed frame" flag** rather than an unconditional render at
   burst end: a burst that changed nothing costs nothing, and the busy/in-flight
   drops keep their existing meaning.
3. **Enter is not pasteable in the non-bracketed path** (RF-S08). Multi-line paste
   on terminals without bracketed support keeps its pre-existing behavior; the
   newline-as-data guarantee stays where it was specified — inside
   `paste-start`/`paste-end` (spec `2026-09-02-prompt-paste`).
4. **Burst timing constants are module-level named constants**, tuned to the grok
   reference (2 ms window, 10 ms quiet, ≥3 keys); the cap on burst length (grok's
   5 000 events) is unnecessary here because the coalesced burst performs no work
   per key beyond a counter.
5. **Clamp both cursor-ups**, not only the erase: AC-03 says "no `ESC[nA` larger
   than `rows-1` is ever emitted", and the reposition can exceed the viewport when
   the caret sits near the top of a tall draft.
6. **The test harness pins `process.stdout.isTTY = true` and `rows`.** The module
   now reads stdout TTY-ness; without pinning, the suite's meaning would depend on
   whether `npm test` output is redirected. Same technique as
   `test/turn-keys-visibility.test.js:125-126`.

## 8. Verification Strategy and Gates

| AC | Check |
|----|---------|
| AC-01 | New test `bracketed paste coalesces into one render` — 500 chars / 20 Enters; counts `╭` top-border writes ≤2, marker text exactly once, `wrapped === false`. |
| AC-02 | New test `non-bracketed keypress burst is coalesced` — 200 synchronous keys; top-border count <10, text once. |
| AC-03 | New test `cursor-up is clamped to the terminal viewport` — `rows = 10`, 30-line draft; parses raw writes for `/\x1B\[(\d+)A/g`, asserts every `n ≤ 9`. |
| AC-04 | New test `non-TTY stdout never receives a cursor-up` — `isTTY = false`; asserts zero `ESC[nA` in the writes. |
| AC-05 | Existing tests #4/#5/#6/#10 (Tab, `/switch` submit, backspace narrowing, Shift+Enter) + new burst test asserting the frame is drawn before the following key acts. |
| AC-06 | Existing test `bracketed multiline paste stays editable until a separate Enter` (unmodified assertions). |
| AC-07 | New assertion in the burst test: after Ctrl+C cleanup, no further write arrives after a 20 ms wait. |
| AC-08 | `node --test test/prompt-input-render.test.js`, `npm test` (exit 0), `npm run lint` (0 errors). |
| AC-09 | `node --check src/ui/prompt-input-persistent.js` + existing layout/clip tests untouched. |
| AC-10 | Docs diff review: CHANGELOG, deep-dive § 22.2/§ 20/§ 21.1, features/terminal-ui.md, visual-identity.md. |

Commands (Rule 6.3, all recorded in `tasks.md`): `node --check
src/ui/prompt-input-persistent.js`; `node --test test/prompt-input-render.test.js`;
`npm run lint`; `npm test`. Smoke: `node bin/emile.js` is interactive-only (needs a
real TTY + credentials), so the automated ANSI-emulator suite stands in for the
manual script — recorded as a limitation in `tasks.md` T3.7 rather than claimed as
verified.

## 9. Git Workflow

| Item | Answer |
|------|--------|
| **Working branch** | `development` — confirmed by `git branch --show-current`; no switch, no branch, no worktree (Rule 8). |
| **Commit plan** | One coherent unit on `development`: spec pack + code + tests + docs, staged with explicit paths (never `git add .`). The pre-existing uncommitted working-tree changes (`src/cli.js`, `integrations/`, `skills-lock.json`, …) belong to another session and are **not** staged. |

## 10. Failures, Partial State and Rollback

| Topic | Strategy |
|------|------------|
| Error handling and user-facing messages | No new user-facing text. Failure mode is a stale frame; the next non-pasteable keypress forces a render. |
| Interruption (Ctrl+C / Esc) and readline state | `shutdown()` clears the quiet timer and sets `settled`; `endBurst()` returns early once settled, so no write can land after cleanup (AC-07). Esc still clears the draft and renders. |
| Partial state (session, undo stack, file cache) | Not applicable — nothing persisted. The draft is never lost: deferral suppresses *drawing*, never *state updates*. |
| Rollback / undo | Single-file revert (`git revert` of the fix commit) restores the previous renderer; no data migration, no config change. |

## 11. Technical Risks and Trade-offs

| Risk | Likelihood | Mitigation |
|-------|---------------|-----------|
| A burst timer fires after the prompt settled and writes to a restored stdout. | Low | `shutdown()` clears the timer; the callback checks `settled`; covered by AC-07 test. |
| Coalescing hides the caret for up to 10 ms inside a paste. | Certain, harmless | Only affects the 3rd+ key of a sub-2 ms run; a human typist never triggers it (RF-S07). |
| The 2 ms heuristic misfires on an extremely slow terminal that chunks a paste into 1-key reads spaced >2 ms. | Low | Worst case = current behavior (one render per key), no duplication because the erase is clamped; bracketed terminals are unaffected. |
| Clamped erase leaves residue above the viewport for taller-than-screen drafts. | Certain for tall drafts | Accepted and documented: scroll is the correct degradation. The real cure is the viewport-budgeted layout (out of scope). |
