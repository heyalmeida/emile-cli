# Spec: Large-paste duplication fix — coalesce the paste burst, clamp the prompt redraw

| Field | Value |
|-------|-------|
| **ID** | `2026-10-09-paste-burst-redraw` |
| **Status** | `implemented` |
| **Phase/Context** | REPL terminal UI / persistent prompt — deep-dive backlog wave 2, brief **P0-4** |
| **Related documents** | [Brief P0-4](../2026-10-08-deep-dive-backlog/briefs/p0-4-paste-burst-redraw.md), [Shared constraints](../2026-10-08-deep-dive-backlog/_shared-constraints.md), [deep-dive § 22.2 / § 20 / § 21.1](../../docs/deep-dive.md), [PRD](../../docs/product.md), [Visual identity](../../docs/visual-identity.md), [ADR-0003](../../docs/adr/0003-active-prompt-output-arbitration.md), [Prior paste spec](../2026-09-02-prompt-paste/spec.md) |

---

## 1. Problem / Motivation

**Active user-reported bug, hit daily.** Pasting a large prompt into the persistent
input duplicates the pasted text many times on screen.

Root cause (verified against the code 2026-10-09, deep-dive § 22.2):

- During bracketed paste, **every** character reaches the text branch of
  `onKeypress` (`src/ui/prompt-input-persistent.js:548-553`) and **every** pasted
  Enter reaches the newline branch (`:474-481`) — each one ends in `render()`
  (`:554`). A 2 KB paste is ~2 000 full-block redraws.
- `render()` erases the previous block through `erasePreviousBlock()`
  (`:300-307`), which emits `\x1B[${lastTopOffset}A` with **no bound**, where
  `lastTopOffset = layout.inputRowIndex + layout.cursorRow` (`:353`). Once the
  block exceeds `process.stdout.rows`, the cursor-up clamps at the viewport top,
  the old frames have already scrolled into the scrollback (un-erasable by
  definition), and every new line redraws the whole block below the previous one
  → the pasted text appears N times.
- `isPasting` (`:437-443`) only converts Enter into a literal newline; it never
  suppresses renders. Non-bracketed terminals (some Windows consoles) deliver a
  paste as a bare keypress burst with **no markers at all**, so they get the same
  duplication with no protection whatsoever.

This is the same failure family as the thinking-stream duplication (deep-dive
§ 7.2, brief P0-1) in a different file: cumulative erase-and-reprint with an
uncapped `ESC[nA`. Width is already bounded (`clipLine` guarantees every drawn
line ≤ `columns`); the gap is **height** — nothing clamps the erase distance to
`stdout.rows` and nothing skips cursor-up when stdout is not a TTY.

RF-14 (persistent writing field) and RF-01 (terminal-native task entry) are the
PRD requirements in play: the field must accept a pasted prompt and stay legible.

## 2. Goal

A large paste — bracketed or not — produces **one** render of the prompt block,
and no cursor-up escape ever exceeds the terminal viewport. After the fix, a
pasted prompt is visible exactly once on screen, at any draft height, on TTY and
non-TTY stdout alike.

## 3. Functional Requirements

| ID | Requirement | Priority (MoSCoW) |
|----|-------------|--------------------|
| RF-S01 | While `isPasting` is true (between `paste-start` and `paste-end`), the draft state (`input`, `cursor`, `selectedIndex`) updates but `render()` produces no output; exactly one render happens on `paste-end`. | Must |
| RF-S02 | A run of ≥3 pasteable (text-producing) keypresses arriving within a 2 ms window is coalesced into a single paste: renders are suppressed inside the burst and one render is emitted at burst end — flushed by a 10 ms quiet timer or by the first non-pasteable keypress. Applies when the terminal sends no bracketed-paste markers. | Must |
| RF-S03 | Every `ESC[nA` the module emits is clamped to `Math.min(n, Math.max((process.stdout.rows \|\| 24) - 1, 0))`. | Must |
| RF-S04 | When `process.stdout.isTTY` is falsy, the module emits no cursor-up at all. | Must |
| RF-S05 | The public API is unchanged: `persistentPromptInput`, `buildPromptLayout`, `clipLine`, `matchPromptCommands` (and `matchPromptMentions`, `PROMPT_MATCH_LIMIT`, `buildPromptFooterSegments`) keep their signatures and semantics. | Must |
| RF-S06 | The existing width guarantee is untouched: every drawn line stays ≤ `columns` and no coalescing path may emit a line wider than the terminal. | Must |
| RF-S07 | A single human keypress renders immediately (no added latency, no timer dependency); only a burst defers. | Must |
| RF-S08 | Enter outside a bracketed paste still submits, exactly as before — burst coalescing must not swallow a deliberate submit. | Must |
| RF-S09 | Bracketed-paste semantics from `specs/2026-09-02-prompt-paste` are preserved: pasted Enter inserts a newline, no submit inside the paste, `?2004h`/`?2004l` enable/disable unchanged. | Must |
| RF-S10 | No coalescing timer may survive prompt cleanup (`shutdown`) or fire after the prompt has settled. | Must |

## 4. Risk, Security and Threat Surfaces

| Field | Answer |
|-------|----------|
| **Risk classification** | **Low** per [Code Quality and Security § 1](../../docs/code-quality-and-security.md) — pure terminal UI rendering/input lifecycle in `src/ui/`; no execution, no paths, no credentials, no LLM input. Failure mode is a garbled or stale prompt frame. |
| **Assets/secrets** | The pasted draft may contain sensitive text. It stays in memory and is handed to the existing `onSubmit` path; nothing new is logged, persisted or echoed (the pre-existing `EMILE_DEBUG_RENDER` stderr trace is unchanged and stays opt-in). |
| **Command execution / file writes** | Not applicable — no `runCommand`, no tool handler, no filesystem access is touched. |
| **Untrusted inputs** | Pasted text is untrusted-by-default user input: it is treated as data only (inserted into the draft, clipped, never interpreted as a control sequence or a submit trigger). Burst detection reads only keypress *metadata* (`key.name`, `ctrl`, `meta`), never the payload. |
| **Negative criteria** | Must NOT: add a dependency; change `buildPromptLayout`/`clipLine` semantics; emit `ESC[nA` beyond `rows-1`; emit any cursor-up on non-TTY stdout; submit on a pasted Enter; drop the `paste-end` render; leave a pending timer after cleanup; weaken or delete any of the 13 existing render tests. |

## 5. Out of Scope

Reported, not fixed (Rule 6.2):

- `src/ui/thinking.js` — same uncapped cursor-up family, owned by brief **P0-1**.
- `src/ui/turn-keys.js` — `hideFrame()` (`:91`) and `drawFrame()` (`:73,78`) carry
  the identical uncapped `ESC[${lastTopOffset}A` / `ESC[${rowsUp}A` pattern; out of
  scope here (its own arbitration work), reported in the final handoff.
- `src/ui/prompt-input.js` (`:192,234,242,365`) and `src/ui/model-picker.js:145` —
  same pattern, different owners.
- Large-paste collapse chip `[Pasted: N lines]` — backlog **P2** (grok
  `prompt_widget/mod.rs:2286-2344`).
- Viewport-budgeted prompt layout (scrollable textarea window) — separate future item.

## 6. Acceptance Criteria

- **AC-01:** Given an idle prompt, when `paste-start` + 500 characters (including 20 Enters) + `paste-end` are delivered, then at most **2** full-block renders reach the terminal (initial + one for the paste), the complete text is visible **exactly once** on the emulated screen, and `wrapped === false`.
- **AC-02:** Given a terminal without bracketed-paste support, when 200 text keypresses are delivered in one synchronous burst, then fewer than **10** full-block renders are emitted and the text appears once.
- **AC-03:** Given `process.stdout.rows === 10`, when a 30-line draft is rendered and redrawn, then no `\x1B[nA` in the raw writes has `n > 9`.
- **AC-04:** Given `process.stdout.isTTY` is falsy, when the prompt renders and redraws, then the writes contain **no** `ESC[nA` sequence at all.
- **AC-05:** Given the burst coalescing is active, when a non-pasteable keypress (arrow, backspace, Tab, Enter) follows a deferred burst, then the pending frame is drawn before that key takes effect and a lone Enter still submits the draft (RF-S08).
- **AC-06:** Given a bracketed paste, when it ends, then `submitted` is still empty and a subsequent separate Enter submits the complete normalized payload (RF-S09, prior spec AC-01/AC-02 regression).
- **AC-07:** Given a prompt shuts down (Ctrl+C / cancel verdict), when the coalescing timer is pending, then no further write reaches stdout after cleanup (RF-S10).
- **AC-08:** All 13 existing tests in `test/prompt-input-render.test.js` keep passing with unchanged assertions; the full suite (`npm test`) exits 0; `npm run lint` reports 0 errors.
- **AC-09:** The exports of `src/ui/prompt-input-persistent.js` and the width guarantee of `clipLine`/`buildPromptLayout` are unchanged (RF-S05, RF-S06).
- **AC-10:** Rule 2 docs sync is applied: `CHANGELOG.md` `[Unreleased] → Fixed`, `docs/deep-dive.md` § 22.2 marked applied + § 20 pattern row updated, `features/terminal-ui.md` Change History row.

## 7. Risks and Open Questions

| Risk/Question | Impact | Mitigation/Answer |
|---------------|---------|--------------------|
| Coalescing defers the visible frame by up to 10 ms inside a burst. | None perceptible; a single keypress is unaffected. | RF-S07 — the first two text keys of any run render synchronously; only the 3rd onwards defers, and only when the gaps are ≤2 ms (a human typist is orders of magnitude slower). |
| A non-bracketed terminal that pastes with an Enter between chunks could split one paste into two bursts. | Two renders instead of one — still bounded, no duplication. | Accepted: burst detection is a *render-count* optimization, not a payload-reassembly one; correctness comes from the clamped erase. |
| Treating Enter as burstable would swallow deliberate submits in fast typists and in existing tests. | Data loss / behavior regression. | RF-S08 — Enter is explicitly **not** pasteable in the non-bracketed path; it flushes the burst and keeps its submit semantics. Bracketed paste keeps the `isPasting` newline rule (RF-S09). |
| Height overflow still degrades to scroll (a 30-line block on a 10-row terminal cannot be fully erased). | Residual frames above the viewport stay in the scrollback. | By design: never erase more than fits; duplication (the reported bug) is eliminated because the block is drawn once per paste. The real fix for tall drafts is the viewport-budgeted layout, listed out of scope. |
| The ANSI emulator harness depends on cursor-up being emitted. | Tests would silently change meaning if stdout is a pipe. | `withFakeTerminal` now pins `process.stdout.isTTY = true` and an explicit `rows`, so the render path is deterministic regardless of how `npm test` output is redirected (same technique as `test/turn-keys-visibility.test.js`). |

## 8. References

- `src/ui/prompt-input-persistent.js` — the only source file changed.
- `test/prompt-input-render.test.js` — ANSI emulator harness (F4: reused, not rebuilt).
- `docs/deep-dive.md` § 22.2 (root cause), § 20 (pattern index), § 21.1 (P0-4), § 7.2 (same failure family).
- `specs/2026-09-02-prompt-paste/spec.md` — bracketed-paste semantics this spec must not regress.
- grok-build `crates/codegen/xai-grok-pager/src/event_loop.rs:3610-3710` — burst coalescing reference (F6).
