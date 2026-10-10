// thinking.js — ui/ module tree (extracted from the former src/ui.js monolith).
// See docs/architecture.md for the module map.
import { ROLE, GAP, wrapText } from './theme.js';
import { sanitizeAssistantOutput } from './sanitize.js';
import { config } from '../config.js';
import { clampedCursorUp } from './terminal-cursor.js';
import { createFrontier } from './commit-frontier.js';

// A CLOSED thinking block is final: its rows are committed once and never
// repainted (print-once, one write, synchronized on a TTY). The still-open
// stream keeps the clamped in-place/append-only paths above until it closes, and
// then commits — see `endThinkingStream`. `write` stays a thunk so the ADR-0003
// stdout lease keeps arbitrating these writes.
const outputFrontier = createFrontier({ write: (chunk) => process.stdout.write(chunk) });
// Identifies each closed block, so a second close of the same stream is a no-op
// instead of a duplicated footer line (the reference's print-once rule).
let _thinkingStreamSeq = 0;


// Opt-in diagnostic: log every stdout write to stderr with the
// pre/post cursor row. Activated by EMILE_DEBUG_THINKING=1.
const DEBUG = process.env.EMILE_DEBUG_THINKING === '1';
let _cursorRow = 0;
function trackCursor(chunk) {
  let i = 0;
  while (i < chunk.length) {
    const ch = chunk[i];
    if (ch === '\n') { _cursorRow += 1; i += 1; continue; }
    if (ch === '\r') { i += 1; continue; }
    if (ch === '\x1B' && chunk[i + 1] === '[') {
      const m = /^\x1B\[([0-9;]*)([A-Za-z])/.exec(chunk.slice(i));
      if (m) {
        const amt = Number(m[1]) || 0;
        if (m[2] === 'A') _cursorRow = Math.max(0, _cursorRow - amt);
        else if (m[2] === 'B') _cursorRow += amt;
        i += m[0].length;
        continue;
      }
    }
    break;
  }
}
function debugWrite(tag, chunk) {
  if (!DEBUG) return;
  const before = _cursorRow;
  trackCursor(chunk);
  const display = chunk.length > 200 ? chunk.slice(0, 200) + '…' : chunk;
  process.stderr.write(`[${tag}] r${before}->r${_cursorRow} ${JSON.stringify(display)}\n`);
}

/**
 * Live thinking stream — renders reasoning deltas in real time as they arrive
 * from the API (Claude-Code-style flowing dim text).
 *
 * Two emission strategies, chosen per stream:
 *
 *   - **in-place redraw** while the whole block still fits inside the viewport
 *     (and stdout is a TTY): climb back to the block top and repaint it, so a
 *     wrapped line can re-flow. Its cursor-up is viewport-clamped.
 *   - **append-only** the moment the block cannot fit, or when stdout is not a
 *     TTY: emit only the lines not yet printed, keep the newest line open
 *     (written without a trailing newline) and rewrite that single row in place
 *     on the next delta. Nothing that may have scrolled is ever erased.
 *
 * The second strategy is the fix for deep-dive § 7.2: the cumulative redraw
 * assumed the cursor could always climb back to the block top, so once the
 * block outgrew the viewport (or stdout was a pipe, where cursor movement is
 * ignored entirely) every frame stayed on screen and the same thought appeared
 * N times. Append-only renders each fragment exactly once on any terminal.
 *
 * Lifecycle (called from agent.js during the SSE stream):
 *   startThinkingStream()      → emit header, begin the block
 *   appendThinkingStream(delta) → append + emit wrapped dim text
 *   endThinkingStream()        → finalize (leaves rendered text in place)
 */
let _thinkingStreamActive = false;
let _thinkingBuffer = '';
let _thinkingLinesPrinted = 0;
let _thinkingHeaderPrinted = false;
let _thinkingHeaderLineCount = 0;
let _startedAsExpanded = false;
// Append-only bookkeeping: how many wrapped lines were already emitted WITH a
// trailing newline, whether the newest one is currently open (emitted without
// one), and the per-stream latch that keeps the strategy sticky once the block
// has outgrown the viewport — a scrolled block can never become erasable again.
let _flushedLineCount = 0;
let _openTailWritten = false;
// Text of the currently open tail. A delta that starts a new line leaves this
// row unchanged, and re-emitting identical text would count as a second
// emission of that line in the byte stream even though the screen is identical.
let _openTailText = '';
let _appendOnly = false;

function resetThinkingLineState() {
  _thinkingLinesPrinted = 0;
  _thinkingHeaderPrinted = false;
  _thinkingHeaderLineCount = 0;
  _flushedLineCount = 0;
  _openTailWritten = false;
  _openTailText = '';
  _appendOnly = false;
}

export function startThinkingStream() {
  if (_thinkingStreamActive) return;
  _thinkingStreamActive = true;
  _thinkingBuffer = '';
  _thinkingStreamSeq += 1;
  resetThinkingLineState();
  _startedAsExpanded = config.expandThinking === true;

  // Expanded (opt-in via /thinking or Ctrl+P): thinking streams visibly as
  // the model reasons. Collapsed (default): a single ghost line that
  // stays until the stream ends. GAP.section provides the single gap after the
  // user divider (vertical rhythm rule).
  if (_startedAsExpanded) {
    { const _o = `${GAP.section}  ${ROLE.thinking('✻')} ${ROLE.thinking('Thinking…')}\n`; debugWrite('thinking.start', _o); process.stdout.write(_o); }
    _thinkingHeaderPrinted = true;
    _thinkingHeaderLineCount = 1;
  } else {
    { const _a = GAP.section; debugWrite('thinking.start.collapsed.a', _a); process.stdout.write(_a); }
    // De-emphasis by ATTRIBUTE (SGR 2 on the terminal's own foreground), not by
    // a hardcoded near-background gray: this line is the only signal that
    // reasoning happened, so it must survive every profile's background
    // (visual-identity § 2; reference `theme/terminal_default.rs:12-18`).
    { const _b = `  ${ROLE.meta.punct('··· thinking')}\n`; debugWrite('thinking.start.collapsed.b', _b); process.stdout.write(_b); }
  }
}

/**
 * Emits only the wrapped lines that are not on screen yet, and leaves the
 * newest one open.
 *
 * Append-only is the safe strategy once the block may have scrolled: a closed
 * line can never be erased again, so the only correct operation is to add new
 * lines below. `_flushedLineCount` is deliberately monotone — a shrink (a
 * cumulative snapshot being deduplicated upstream) may clamp which line we
 * rewrite as the open tail, but it must never rewind the cursor, because
 * re-emitting an already printed line is exactly the duplication this module
 * exists to prevent.
 */
function appendThinkingLines(newLines) {
  _appendOnly = true;
  const lastIndex = Math.max(newLines.length - 1, 0);
  const tailIndex = Math.min(_flushedLineCount, lastIndex);
  let output = '';
  let next = _flushedLineCount;

  if (_openTailWritten) {
    // The cursor sits on the open tail: rewrite that single row in place when
    // its text changed (a delta that extends the same wrapped line), which is
    // always safe even after a scroll because it touches no other row. When the
    // text is unchanged the row is already correct, so closing it is enough —
    // re-emitting identical text would be a second occurrence of that line.
    if (newLines[tailIndex] !== _openTailText) {
      output += '\r\x1B[K' + '  ' + ROLE.thinking(newLines[tailIndex]);
    }
    if (lastIndex > _flushedLineCount) {
      output += '\n'; // that row is now closed; its successors are new
      next = _flushedLineCount + 1;
    } else {
      next = newLines.length; // nothing new to emit
    }
  }

  for (let i = next; i < newLines.length; i++) {
    const isOpenTail = i === lastIndex;
    output += `  ${ROLE.thinking(newLines[i])}${isOpenTail ? '' : '\n'}`;
  }

  debugWrite('thinking.appendOnly', output);
  process.stdout.write(output);
  _flushedLineCount = Math.max(_flushedLineCount, lastIndex);
  _openTailWritten = newLines.length > 0;
  _openTailText = newLines[tailIndex];
  _thinkingLinesPrinted = newLines.length;
}

export function appendThinkingStream(delta) {
  if (!delta) return;
  if (!_thinkingStreamActive) startThinkingStream();
  _thinkingBuffer += delta;

  // Collapsed: buffer only — the ghost indicator line stays as-is
  if (!_startedAsExpanded) return;

  const cols = process.stdout.columns || 80;
  const innerW = Math.max(cols - 4, 40);

  // Build new wrapped muted lines
  const newLines = [];
  for (const rawLine of _thinkingBuffer.split('\n')) {
    if (rawLine.trim().length === 0) { newLines.push(''); continue; }
    for (const w of wrapText(rawLine, innerW)) newLines.push(w);
  }

  // The in-place redraw is only correct while the whole block fits above the
  // cursor inside the viewport, and only on a terminal that honors cursor
  // movement at all. Once either fails, the stream latches append-only for good.
  const fits = _thinkingHeaderLineCount + newLines.length
    <= Math.max((process.stdout.rows || 50) - 2, 1);
  if (!process.stdout.isTTY || _appendOnly || !fits) {
    appendThinkingLines(newLines);
    return;
  }

  const oldTotal = _thinkingHeaderLineCount + _thinkingLinesPrinted;
  const newTotal = _thinkingHeaderLineCount + newLines.length;

  let output = '';

  // Move cursor up to the start of the thinking block (header + old muted
  // lines). Clamped: even if the fit estimate is off by a row, this can never
  // emit an escape longer than the viewport can honor. Embedded rather than
  // written through writeCursorUp() because the frame must stay ONE write —
  // under the ADR-0003 stdout lease the prompt is repainted between writes, so
  // a separate cursor-up would be erased before the frame it belongs to lands.
  const up = clampedCursorUp(oldTotal);
  if (up > 0) {
    output += `\x1B[${up}A`;
  }

  // Re-render header
  if (_thinkingHeaderPrinted) {
    output += '\r\x1B[K' + `  ${ROLE.thinking('✻')} ${ROLE.thinking('Thinking…')}\n`;
  }

  // Re-render muted lines, each with line-erase prefix
  for (const line of newLines) {
    output += '\r\x1B[K' + '  ' + ROLE.thinking(line) + '\n';
  }

  // If new content has fewer lines, clear the leftover lines
  if (newTotal < oldTotal) {
    for (let i = 0; i < oldTotal - newTotal; i++) {
      output += '\r\x1B[K\n';
    }
    // Move cursor back up so position is consistent (same clamp, same write)
    const back = clampedCursorUp(oldTotal - newTotal);
    if (back > 0) output += `\x1B[${back}A`;
  }

  debugWrite('thinking.append', output); process.stdout.write(output);

  _thinkingLinesPrinted = newLines.length;
}

export function endThinkingStream() {
  if (!_thinkingStreamActive) return;
  _thinkingStreamActive = false;

  const wordCount = _thinkingBuffer.trim().split(/\s+/).length;
  const secs = Math.max(1, Math.round(wordCount / 50));
  const durationStr = secs === 1 ? '1s' : `${secs}s`;
  // Identifies the block this call closes: print-once, so a second close of the
  // same stream can never emit a second footer.
  const closeId = `thinking:${_thinkingStreamSeq}:close`;

  if (!_startedAsExpanded) {
    // Collapsed: rewrite the indicator line in place as the final one-liner
    // (`··· thought Ns`). Exactly one row — rhythm preserved, no cursor-up math
    // beyond the single line itself, so the frontier writes it verbatim (a
    // one-row block is never wrapped in synchronized output). Same DIM rule as
    // the start line above.
    if (wordCount > 0) {
      const _o = `\x1B[1A\r\x1B[2K  ${ROLE.meta.punct(`··· thought ${durationStr}`)}\n`;
      debugWrite('thinking.end.collapsed', _o);
      outputFrontier.commit({ id: closeId, text: _o });
    }
  } else if (_appendOnly || !process.stdout.isTTY) {
    // Append-only: the header and the closed lines may have scrolled, so there
    // is no safe way back to the block top. Close the open tail (that newline
    // belongs to the STREAM, not to the finalized block) and commit a fresh
    // one-row footer — no cursor-up at all.
    let tail = '';
    if (_openTailWritten) tail += '\n';
    debugWrite('thinking.end.appendOnly', tail); process.stdout.write(tail);
    outputFrontier.commit({ id: closeId, text: `  ${ROLE.thinking('✻')} ${ROLE.thinking(`Thought for ${durationStr}`)}\n` });
  } else if (_thinkingHeaderPrinted) {
    // Expanded and still fitting: keep the streamed text in place and update
    // only the known header row with the final duration. Move back to the end
    // of the block afterwards so the next renderer starts at the correct cursor
    // position. The climb is viewport-clamped like every other cursor-up.
    const totalLines = _thinkingHeaderLineCount + _thinkingLinesPrinted;
    // Clamped and embedded in the same write, for the same lease-atomicity
    // reason as the in-place append path above.
    const up = clampedCursorUp(totalLines);
    let output = '';
    if (up > 0) output += `\x1B[${up}A`;
    output += '\r\x1B[K' + `  ${ROLE.thinking('✻')} ${ROLE.thinking(`Thought for ${durationStr}`)}\n`;
    if (totalLines > _thinkingHeaderLineCount) {
      output += `\x1B[${totalLines - _thinkingHeaderLineCount}B`;
    }
    debugWrite('thinking.end.expanded', output);
    outputFrontier.commit({ id: closeId, text: output });
  }

  resetThinkingLineState();
  _startedAsExpanded = false;
}

/**
 * Prints thinking/reasoning block in the chat after the agent has thought.
 *
 * Expanded (/thinking):  ✻ Thought for 3s + full muted content
 * Collapsed (default):  ··· thought 3s  (ghost — nearly invisible)
 */
export function printThinking(content) {
  const cleanContent = sanitizeAssistantOutput(content);
  if (!cleanContent || cleanContent.trim().length === 0) return;

  // Expanded only when the single reasoning visibility state is enabled.
  const isVerbose = config.expandThinking === true;
  const innerWidth = Math.max((process.stdout.columns || 80) - 10, 40);

  const allLines = cleanContent.trim().split(/\r?\n/).filter(l => l.trim().length > 0);
  // Word-count heuristic for duration estimate
  const wordCount = cleanContent.trim().split(/\s+/).length;
  const secs = Math.max(1, Math.round(wordCount / 50));
  const durationStr = secs === 1 ? '1s' : `${secs}s`;

  // Two leading blank lines so the block breathes after the user's message
  // divider / previous block (vertical rhythm for a standalone reasoning box).
  let out = '\n\n';

  if (!isVerbose) {
    // Collapsed: single dim line — thinking is background noise, but the fact
    // that it happened must stay readable on any background.
    out += `  ${ROLE.meta.punct(`··· thought ${durationStr}`)}\n`;
  } else {
    // Verbose: muted header + full content (no truncation — every line is wrapped)
    out += `  ${ROLE.thinking('✻')} ${ROLE.thinking(`Thought for ${durationStr}`)}\n`;
    for (const rawLine of allLines) {
      for (const wrapped of wrapText(rawLine, innerWidth)) {
        if (wrapped.trim().length > 0) {
          out += `    ${ROLE.thinking(wrapped)}\n`;
        }
      }
    }
  }

  // The finished block is FINAL: committed once, never repainted (print-once
  // applies to identified blocks; this one is one-shot, so a replay of identical
  // content is legitimately printed again).
  outputFrontier.commit(out);
}
