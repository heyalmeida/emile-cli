# Fix: reasoning streaming disappears / corrupts terminal

| Field | Value |
|-------|-------|
| **Branch** | `fix/reasoning-details-display` |
| **File affected** | `src/ui/thinking.js` (only) |
| **Risk** | Medium — touches the live-stream cursor math and header layout |
| **Symptom** | Expanded reasoning streaming produces a corrupted/misaligned block; the `Thinking…` header is written on the wrong line; the `Thought for Ns` final header is rewritten in the wrong position; mid-stream toggles can desync the cursor. |
| **Not a fix** | The agent-side parser (`src/agent/reasoning.js`, `src/agent/agent.js` lines 208-255) is correct. The bug is purely in the **rendering** layer. |

---

## 1. Root cause

The expanded-mode header in `startThinkingStream()` currently writes:

```js
// src/ui/thinking.js:37
process.stdout.write(`  ${C.muted('✻')} ${C.muted('\nThinking…')}\n`);
```

The `C.muted('\nThinking…')` call wraps a string that **starts with a literal newline** in the muted color. The terminal receives two physical lines:

```
line N:     "  ✻ "          (muted, no word follows)
line N + 1: "Thinking…"     (muted)
```

The internal state set in the same call is:

```js
_thinkingHeaderPrinted = true;   // header exists
_thinkingLinesPrinted  = 0;      // but counts as 0 content lines
```

Every later redraw computes `oldTotal = (_thinkingHeaderPrinted ? 1 : 0) + _thinkingLinesPrinted`, i.e. **1 line of header**. It then issues `\x1B[1A` (move up 1 row), redraws the header, and writes new content lines. The "move up 1" lands on the `  ✻` line; the redraw of the header and the first content line overwrite `  ✻` and the orphan `Thinking…` row respectively.

The terminal's view of the cursor drifts by one line per redraw, so subsequent deltas progressively land on top of the previous render and (depending on the terminal) **either** print garbled overlapping blocks **or** appear to swallow the reasoning text entirely.

`endThinkingStream()` then computes `totalLines = 1 + _thinkingLinesPrinted` and issues `\x1B[${totalLines}A`. Because the header actually occupies 2 physical lines, the cursor ends up **one row too high**, and the `Thought for Ns` rewrite lands on top of the last content row instead of the header. The cursor is then restored with `\x1B[${totalLines - 1}B` and the next renderer (tool lines / response box) starts one line above its intended position.

A secondary issue: in some terminals, the muted color "leaks" across the literal `\n` inside the muted string, leaving the first content line incorrectly muted.

---

## 2. Additional issue: toggle mid-stream

If the user presses `Ctrl+P` (or runs `/thinking`) while a stream is active, `config.expandThinking` changes between `startThinkingStream()` and `endThinkingStream()`. Today, `endThinkingStream()` decides the final branch by reading `config.expandThinking` **at end time**, not at start time. Result: a stream that started expanded can finish as collapsed (or vice versa) and rewrite the wrong kind of line. The redraw math in `appendThinkingStream()` is also affected, because that function branches on the live `config.expandThinking` value.

---

## 3. Proposed fix (touch only `src/ui/thinking.js`)

### 3.1 Track the header's physical line count

Add a module-level counter initialized alongside the existing state:

```js
let _thinkingHeaderPrinted = false;
let _thinkingHeaderLineCount = 0;   // NEW
let _startedAsExpanded = false;     // NEW — snapshot of the visibility state at start
```

### 3.2 `startThinkingStream()` — single-line header, no color leak

```js
export function startThinkingStream() {
  if (_thinkingStreamActive) return;
  _thinkingStreamActive = true;
  _thinkingBuffer = '';
  _thinkingLinesPrinted = 0;
  _thinkingHeaderPrinted = false;
  _thinkingHeaderLineCount = 0;
  _startedAsExpanded = config.expandThinking === true;

  if (_startedAsExpanded) {
    process.stdout.write(GAP.section);
    process.stdout.write(`  ${C.muted('✻')} ${C.muted('Thinking…')}\n`);
    _thinkingHeaderPrinted = true;
    _thinkingHeaderLineCount = 1;
  } else {
    process.stdout.write(GAP.section);
    process.stdout.write(`  ${C.ghost('··· thinking')}\n`);
  }
}
```

Two changes:
- The header is now a **single physical line** (`  ✻ Thinking…`). The `\n` literal is gone, so no color leak.
- `_thinkingHeaderLineCount` is recorded explicitly. The redraw math in `appendThinkingStream()` and the final move in `endThinkingStream()` must use it.

### 3.3 `appendThinkingStream()` — use the recorded line count

```js
const oldTotal = _thinkingHeaderLineCount + _thinkingLinesPrinted;
const newTotal = _thinkingHeaderLineCount + newLines.length;
```

Replace both occurrences of `(_thinkingHeaderPrinted ? 1 : 0)`. The `_thinkingHeaderPrinted` flag stays for "is the expanded header in place", but the **math** is driven by `_thinkingHeaderLineCount`.

### 3.4 `endThinkingStream()` — branch on the snapshot, not the live state

```js
export function endThinkingStream() {
  if (!_thinkingStreamActive) return;
  _thinkingStreamActive = false;

  const wordCount = _thinkingBuffer.trim().split(/\s+/).length;
  const secs = Math.max(1, Math.round(wordCount / 50));
  const durationStr = secs === 1 ? '1s' : `${secs}s`;

  if (!_startedAsExpanded) {
    // Collapsed: rewrite the ghost indicator line in place.
    if (wordCount > 0) {
      process.stdout.write('\x1B[1A\r\x1B[K');
      process.stdout.write(`  ${C.ghost(`··· thought ${durationStr}`)}\n`);
    }
  } else {
    // Expanded: rewrite only the known header row with the final duration.
    if (_thinkingHeaderPrinted) {
      const totalLines = _thinkingHeaderLineCount + _thinkingLinesPrinted;
      process.stdout.write(`\x1B[${totalLines}A`);
      process.stdout.write('\r\x1B[K' + `  ${C.muted('✻')} ${C.muted(`Thought for ${durationStr}`)}\n`);
      if (totalLines > _thinkingHeaderLineCount) {
        process.stdout.write(`\x1B[${totalLines - _thinkingHeaderLineCount}B`);
      }
    }
  }

  _thinkingHeaderPrinted = false;
  _thinkingHeaderLineCount = 0;
  _startedAsExpanded = false;
}
```

Notes:
- The branch uses `_startedAsExpanded` (snapshot at start) so a mid-stream toggle does not change how the block is finalized.
- The rewrite of the header uses the **same string** as `startThinkingStream()` with only the trailing word swapped, so the physical line count matches.
- The cursor-restoring `\x1B[${totalLines - _thinkingHeaderLineCount}B` returns to the end of the content (the same place the next renderer expects to start).

### 3.5 Optional: block toggle mid-stream

If you want the simplest, most predictable UX, reject the toggle while a stream is active and tell the user it will apply on the next turn. In `src/cli.js:355` and `src/ui/prompt-input.js:313`:

```js
import { isThinkingStreamActive } from '../ui/thinking.js';

config.expandThinking = isThinkingStreamActive()
  ? config.expandThinking
  : (config.expandThinking === true ? false : true);
```

Add an exported `isThinkingStreamActive()` from `src/ui/thinking.js` (one-line getter). This avoids the toggle-mid-stream state machine entirely.

If you prefer the snapshot approach, the `_startedAsExpanded` flag above is enough on its own.

---

## 4. Files to modify

| File | Change |
|------|--------|
| `src/ui/thinking.js` | Fix header string, add `_thinkingHeaderLineCount` and `_startedAsExpanded`, update redraw math in `appendThinkingStream` and `endThinkingStream`, optionally export `isThinkingStreamActive`. |

No other module needs to change. `src/agent/agent.js` keeps its existing `startThinkingStream` / `appendThinkingStream` / `endThinkingStream` calls.

---

## 5. Tests / verification

1. **Unit**: extend `test/reasoning.test.js` only if the helper's behavior changes (it does not). The fix is in the renderer, which is exercised by the harness.
2. **Harness**: run `node test-ui.js` and inspect the "expanded thinking" section. The header should be a **single line** `  ✻ Thinking…`, the redraw should not introduce phantom rows, and the `Thought for Ns` line should replace `Thinking…` in place (not be written on top of content).
3. **Manual smoke** (requires API credentials): with `config.expandThinking = true`, ask a reasoning model a question and watch the terminal. Expected: one `  ✻ Thinking…` line, content streaming below it line by line (with redraws cleanly anchored), and a final `  ✻ Thought for Ns` header where the original `Thinking…` was.
4. **Edge case**: trigger an `openrouter/free` response with no reasoning. The collapsed path should leave the `··· thinking` ghost untouched (no fabricated duration).
5. **Edge case (optional)**: press `Ctrl+P` while a stream is active. If the toggle is blocked, a status message appears. If the snapshot is used, the final block matches what the user saw on screen.

---

## 6. Why this is a renderer bug, not a parser bug

- `src/agent/agent.js:208-255` correctly parses `delta.reasoning_content`, `delta.reasoning` and `delta.reasoning_details`. The structured-reasoning helper (`src/agent/reasoning.js`) preserves and merges fragments correctly (4/4 tests passing in `test/reasoning.test.js`).
- The data flows fine: every `appendThinkingStream(delta)` call receives a non-empty `delta` whenever the model produces reasoning. The terminal never sees the text because the **header is being written on top of it** during the redraw cycle.
- Replacing the `C.muted('\nThinking…')` pattern with a single-line, single-color header removes the off-by-one and the color leak, which is the smallest change that fixes the reported symptom without touching the agent or config layer.

---

## 7. Documentation sync (Rule 2)

After the fix:

- `CHANGELOG.md` → add a `### Fixed` entry under `[Unreleased]`: "Reasoning header is now rendered as a single line; the expanded-mode `Thought for Ns` rewrite lands on the correct row and no longer overwrites content."
- `docs/visual-identity.md` → keep the existing `Thinking stream` and `Reasoning block` rows; nothing changes visually.
- `features/terminal-ui.md` → no change (the spec registry already lists the 2026-08-30 fix as the source of the unified toggle).

No new ADR is required: the fix is a defect correction within an already-ratified design (no new dependency, no new pattern).
