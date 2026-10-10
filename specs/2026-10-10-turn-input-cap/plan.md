# Plan: Input typed during a running turn is no longer silently truncated

> Filled from the approved `spec.md`. The design is fixed by brief P1-13 and is
> not re-derived here; this document records how it lands.
>
> **Implementation note (one deliberate deviation, recorded after the fact):**
> the brief asked to keep the control-character stripping "unchanged" while also
> requiring tabs to survive the queued line. Those are contradictory: the
> original range `\u0000-\u0009` **includes TAB** (`0x09`), so any tab was
> rewritten as a space. The range is now `\u0000-\u0008\u000b-\u001f\u007f\u0080-\u009f`
> — C0 except HT/LF, DEL and the C1 range. Every character that can carry a
> terminal escape or corrupt the transcript is still replaced (asserted by a
> test with BEL/ESC/BS/C1); only TAB stops being collateral damage. See
> `tasks.md` → Limitations.

| Field | Value |
|-------|-------|
| **Spec** | `2026-10-10-turn-input-cap` |
| **Status** | `implemented` |

---

## 1. Technical Approach

Two files plus a test suite. No new module, no new dependency, no new panel.

### 1.1 `src/ui/turn-keys.js`

**The limit becomes visible and generous.**

```js
export const TURN_INPUT_MAX_CHARS = 16_000;
```

Documented as a memory guard, not a UX limit: the idle prompt accepts unbounded
input, so this number exists to keep one live draft bounded, not to constrain
what the user may say.

**One helper owns the drop-oldest policy**, so all three growth paths share it:

```js
function trimDraftHead() {
  const overflow = buffer.length - TURN_INPUT_MAX_CHARS;
  if (overflow <= 0) return false;
  buffer = buffer.slice(overflow);          // keep the NEWEST characters
  cursor = Math.max(0, cursor - overflow);  // cursor follows the text under it
  return true;
}
```

Callers that grew the buffer call it and then either print the notice or repaint:

```js
function noteDroppedHead() {          // one notice per turn, never a storm
  if (truncationNoticed) return;
  truncationNoticed = true;
  process.stdout.write(`\r\x1B[K  ${C.dim(`⚠ queued draft reached ${formatK(TURN_INPUT_MAX_CHARS)} chars — oldest text dropped`)}\n`);
}
```

The notice goes through `process.stdout.write` (not `writeDirect`), so the
ADR-0003 lease routes it above the prompt frame — exactly like the existing
`queued:` preview.

Changes at the call sites:

| Site | Before | After |
|------|--------|-------|
| text insertion (`:287-292`) | `buffer.length < MAX` gate + `text.slice(0, available)` | accept the whole chunk, then `trimDraftHead()` |
| `Enter` during paste (`:205-214`) | `buffer.length < MAX` gate | insert `\n`, then `trimDraftHead()` |
| `Shift+Enter` (`:196-204`) | `buffer.length < MAX` gate | insert `\n`, then `trimDraftHead()` |
| submit (`:223`) | `if (line && …) onLine(line)` | `if (line && line.trim().length > 0 && …) onLine(line)` |

**`sanitizeLine` stops mutating content.** It keeps CRLF normalization, keeps the
control-character replacement (safety — this is the terminal-escape surface) and
keeps the final `.slice(TURN_INPUT_MAX_CHARS)` guard, but drops the whitespace
collapse (`[^\S\n]+` → `' '`) and `.trim()`. The queued message is therefore
byte-identical to the draft apart from CRLF normalization and control-character
replacement. Not queuing a whitespace-only draft is handled where it belongs — at
the decision point — instead of by mutating the user's text.

**The footer counter reuses the existing segment mechanism.** In
`createLiveInput.drawFrame`:

```js
const footerSegments = buildPromptFooterSegments(promptOptions);
if (buffer.length > TURN_INPUT_MAX_CHARS * 0.8) {
  footerSegments.push(C.muted(`queued draft: ${formatK(buffer.length)}/16k`));
}
```

No new panel, no change to `persistentPromptInput`, no change to its layout
builder (the counter is one more segment in the row the layout already renders).

**Preview formatting moves into a testable pure helper**, because the marker is
part of the queue-line contract that `turn-keys.js` owns:

```js
export function formatQueuePreview(line) {
  const preview = String(line || '').replace(/\s+/g, ' ');   // display only
  if (preview.length <= QUEUE_PREVIEW_CHARS) return preview;
  return `${preview.slice(0, QUEUE_PREVIEW_CHARS)}… (+${preview.length - QUEUE_PREVIEW_CHARS} chars)`;
}
```

The `replace(/\s+/g, ' ')` stays **here** and only here: it flattens the line for
a single-row preview and never touches the queued payload.

### 1.2 `src/ui/index.js`

The barrel re-exports the new helpers (`listenTurnKeys` line already exists):
`TURN_INPUT_MAX_CHARS`, `formatQueuePreview`.

### 1.3 `src/cli.js`

The `onLine` handler uses the helper:

```js
onLine: (line) => {
  pendingQueue.push(line);
  process.stdout.write(`\r\x1B[K  ${C.muted(`queued: ${formatQueuePreview(line)}`)}\n`);
},
```

This is the only change in `cli.js` — the queue, the drain and the turn loop are
untouched.

## 2. Architectural Compliance

- **Relevant ADR(s):** ADR-0001 (pure ESM, no dependency) — respected.
  ADR-0002 (quality gates) — new dedicated suite plus the standard gates.
  ADR-0003 (active-prompt stdout arbitration) — respected: the notice and the
  preview both write through the leased `process.stdout.write`, and the frame is
  still emitted atomically by `writeDirect`.
- **Architecture document:** the `ui/` row already describes the active-turn input
  as a raw-mode owner that renders the shared frame; nothing about module
  ownership changes, so no row edit is required (verified, not assumed).
- **Design system:** `docs/visual-identity.md` — the notice is `C.dim` and the
  counter is `C.muted`, matching the existing dim/muted vocabulary for
  secondary information; the footer's ` · ` separator comes from the layout
  builder, so the counter sits in the established row.

## 3. Security and Threat Model

| Element | Handling |
|----------|------------|
| Command execution and whitelist | Not applicable — no tool path touched. |
| File writes and `resolveSafePath` | Not applicable — nothing is written to disk here. |
| LLM inputs (prompt injection / tool args) | The queued text is user input that becomes the next turn's prompt. Control characters remain stripped (unchanged) so terminal escapes cannot be injected into the transcript; the notice prints only a size, never content. |
| Secrets (API keys, sessions, exports) | No new logging or persistence; the draft is not written anywhere new. |
| Controls and negative criteria | AC-01/02 are the "no silent loss, newest survives" checks; AC-03/04 pin the content-integrity pair (whitespace survives, controls are still replaced); AC-05/06 make the new behaviour visible; AC-08 pins the idle prompt as unchanged. |

## 4. Impacted Modules

| Module | Path | Change |
|--------|---------|---------|
| Active-turn input | `src/ui/turn-keys.js` | New limit constant, drop-oldest helper, one-per-turn notice, footer counter, non-mutating `sanitizeLine`, exported preview formatter. |
| UI barrel | `src/ui/index.js` | Re-exports the two new symbols. |
| CLI queue handler | `src/cli.js` | Preview uses the shared formatter (one line). |
| Tests | `test/turn-input-cap.test.js` | New suite: cap/drop-oldest, notice count, whitespace integrity, control chars, counter, preview marker, paste newlines, idle-prompt regression. |

## 5. Impacted Flags / Slash Commands / Tools

| Type | Name | Change |
|------|------|--------|
| CLI flag | — | none |
| Slash command | — | none |
| Tool | — | none |
| Env var | `EMILE_DEBUG_*` | unchanged |
| Implicit behaviour | active-turn draft limit | 400 → 16 000 characters, visible and drop-oldest |

## 6. Files to Create/Modify

| Action | Path | Notes |
|------|--------|-------|
| Create | `specs/2026-10-10-turn-input-cap/spec.md` | this spec |
| Create | `specs/2026-10-10-turn-input-cap/plan.md` | this plan |
| Create | `specs/2026-10-10-turn-input-cap/tasks.md` | tasks + verification log |
| Create | `test/turn-input-cap.test.js` | new suite |
| Modify | `src/ui/turn-keys.js` | constant, helpers, notice, counter, `sanitizeLine`, preview formatter |
| Modify | `src/ui/index.js` | barrel re-export |
| Modify | `src/cli.js` | preview formatter call |
| Modify | `CHANGELOG.md` | `[Unreleased] → Fixed` |
| Modify | `docs/deep-dive.md` | § 19 note + § 21.1 P1-13 applied |
| Modify | `features/terminal-ui.md` | Change History row + active-turn-input technical row |
| Modify | `specs/2026-10-08-deep-dive-backlog/README.md` | pack status row |

## 7. Technical Decisions (summary)

1. **Drop-oldest, not drop-newest.** When a user re-pastes a brief into a running
   turn, the text they just pasted is the text they want; the oldest characters
   are the ones already superseded. This also matches the spec's negative
   criterion explicitly.
2. **One notice per turn, not per keypress.** A 20 000-character paste produces
   thousands of insertions; a per-insertion message would flood the transcript.
   A single closure boolean covers the whole `listenTurnKeys` lifetime.
3. **The counter reuses footer segments** rather than a dedicated panel: the
   layout builder already renders a footer row with ` · ` separators, so this is
   one array push — and it deliberately does not touch
   `persistentPromptInput`'s state machine.
4. **Whitespace integrity at the cost of a submit-site guard.** `.trim()` is
   removed from `sanitizeLine` so the queued text is byte-faithful; the "don't
   queue an empty draft" decision moves to the submit branch, where it does not
   mutate anything.
5. **The preview formatter is exported and pure.** The `(+N chars)` marker is
   part of the queue-line contract and an acceptance criterion, so it must be
   testable directly rather than only through a full CLI run; `turn-keys.js` owns
   the queue line, so it owns the formatter.
6. **80% threshold for the counter.** Enough warning before the limit is reached,
   while a short draft keeps the footer clean.

## 8. Verification Strategy and Gates

| AC | Check |
|----|---------|
| AC-01 | Test: 20 000-char paste into a live turn → queued length === 16000, tail === newer text, notice occurrences === 1. |
| AC-02 | Test: two pastes (A then B) → queued tail ends with B, the dropped A-prefix is absent. |
| AC-03 | Test: `'a\tb  c'` → queued is byte-identical (tabs and double spaces intact). |
| AC-04 | Test: `'a\u0007b'` → queued is `'a b'`. |
| AC-05 | Test: paste just over 80% → footer frame contains `queued draft:`; paste well below → it does not. |
| AC-06 | Test: `formatQueuePreview` on a 16 000-char line carries `(+16000-90 chars)`-style marker; a short line carries none. |
| AC-07 | Test: bracketed paste with `paste-start`/`paste-end` and many pasted Enters → the queued line keeps its newlines and exceeds 400 characters. |
| AC-08 | Test: `persistentPromptInput` with an 8 681-char paste submits the full text; plus `node --test test/prompt-input-render.test.js test/thinking-stream-append.test.js`. |
| AC-09 | `node --check` both files, `node --test` new suite (and neighbours), `npm run lint`, `npm test` (exit 0). |
| AC-10 | Docs diff review + Rule 5 table validation. |

Commands (Rule 6.3): `node --check src/ui/turn-keys.js src/cli.js`;
`node --test test/turn-input-cap.test.js`; `npm run lint`; `npm test`. Smoke: the
interactive `node bin/emile.js` path needs a live turn plus manual paste, so the
keypress-driven suite stands in (it drives the real `listenTurnKeys` with the real
lease installed); recorded in `tasks.md`.

## 9. Git Workflow

| Item | Answer |
|------|--------|
| **Working branch** | `development` (confirmed by `git branch --show-current`); no switch/branch/worktree (Rule 8). |
| **Commit plan** | One coherent unit: spec pack + code + tests + docs, staged with explicit paths (never `git add .`/`-A`). The untracked `prompt-paste-text.txt` in the root is the user's own capture and is left alone. |

## 10. Failures, Partial State and Rollback

| Topic | Strategy |
|------|------------|
| Error handling and user-facing messages | The new notice is the only message added; it states the limit and what was dropped, in the established dim tone. |
| Interruption (Ctrl+C / Esc) and stdin state | Untouched: cancel still goes through turn control, and `cleanup()` still restores raw mode and stdout. |
| Partial state | The draft is in-memory only; the notice flag is per-`listenTurnKeys` instance, so a new turn starts with a clean slate. |
| Rollback / undo | Revert the commit — no migration, no persisted state, no config change. |

## 11. Technical Risks and Trade-offs

| Risk | Likelihood | Mitigation |
|-------|---------------|-----------|
| Cursor math when trimming the head (`cursor` must follow the text under it). | Medium | One helper does `cursor = Math.max(0, cursor - overflow)`; asserted by a test that pastes past the cap and then keeps typing/deleting. |
| A 16 000-character draft repaints more rows on every keypress. | Certain, benign | The layout clips each row (width is already bounded) and the frame is one atomic write; P2-18 tracks the missing height budget separately. |
| Losing `.trim()` changes what gets queued for a whitespace-only draft. | Low | Guarded at the submit site, with a test for the empty-draft case. |
| `formatK` formatting could drift from the notice wording. | Low | One formatter for both, with the notice text derived from the constant rather than hardcoded. |