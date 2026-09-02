// thinking.js — ui/ module tree (extracted from the former src/ui.js monolith).
// See docs/architecture.md for the module map.
import { C, GAP, wrapText } from './theme.js';
import { sanitizeAssistantOutput } from './sanitize.js';
import { config } from '../config.js';

/**
 * Live thinking stream — renders reasoning deltas in real time as they arrive
 * from the API (Claude-Code-style flowing dim text). The block is redrawn on
 * every delta with proper word-wrap + indentation so long lines stay readable.
 *
 * Lifecycle (called from agent.js during the SSE stream):
 *   startThinkingStream()      → emit header, begin the block
 *   appendThinkingStream(delta) → append + redraw wrapped dim text
 *   endThinkingStream()        → finalize (leaves rendered text in place)
 */
let _thinkingStreamActive = false;
let _thinkingBuffer = '';
let _thinkingLinesPrinted = 0;
let _thinkingHeaderPrinted = false;
let _thinkingHeaderLineCount = 0;
let _startedAsExpanded = false;

export function startThinkingStream() {
  if (_thinkingStreamActive) return;
  _thinkingStreamActive = true;
  _thinkingBuffer = '';
  _thinkingLinesPrinted = 0;
  _thinkingHeaderPrinted = false;
  _thinkingHeaderLineCount = 0;
  _startedAsExpanded = config.expandThinking === true;

  // Expanded (opt-in via /thinking or Ctrl+P): thinking streams visibly as
  // the model reasons. Collapsed (default): a single ghost line that
  // stays until the stream ends. GAP.section provides the single gap after the
  // user divider (vertical rhythm rule).
  if (_startedAsExpanded) {
    process.stdout.write(`${GAP.section}  ${C.muted('✻')} ${C.muted('Thinking…')}\n`);
    _thinkingHeaderPrinted = true;
    _thinkingHeaderLineCount = 1;
  } else {
    process.stdout.write(GAP.section);
    process.stdout.write(`  ${C.ghost('··· thinking')}\n`);
  }
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

  const oldTotal = _thinkingHeaderLineCount + _thinkingLinesPrinted;
  const newTotal = _thinkingHeaderLineCount + newLines.length;
  let output = '';

  // Move cursor up to the start of the thinking block (header + old muted lines)
  if (oldTotal > 0) {
    output += `\x1B[${oldTotal}A`;
  }

  // Re-render header
  if (_thinkingHeaderPrinted) {
    output += '\r\x1B[K' + `  ${C.muted('✻')} ${C.muted('Thinking…')}\n`;
  }

  // Re-render muted lines, each with line-erase prefix
  for (const line of newLines) {
    output += '\r\x1B[K' + '  ' + C.muted(line) + '\n';
  }

  // If new content has fewer lines, clear the leftover lines
  if (newTotal < oldTotal) {
    for (let i = 0; i < oldTotal - newTotal; i++) {
      output += '\r\x1B[K\n';
    }
    // Move cursor back up so position is consistent
    output += `\x1B[${oldTotal - newTotal}A`;
  }

  process.stdout.write(output);
  _thinkingLinesPrinted = newLines.length;
}

export function endThinkingStream() {
  if (!_thinkingStreamActive) return;
  _thinkingStreamActive = false;

  const wordCount = _thinkingBuffer.trim().split(/\s+/).length;
  const secs = Math.max(1, Math.round(wordCount / 50));
  const durationStr = secs === 1 ? '1s' : `${secs}s`;

  if (!_startedAsExpanded) {
    // Collapsed: rewrite the ghost indicator line in place as the final
    // one-liner (`··· thought Ns`). Exactly one line — rhythm preserved, no
    // cursor-up math beyond the single line itself.
    if (wordCount > 0) {
      process.stdout.write(`\x1B[1A\r\x1B[2K  ${C.ghost(`··· thought ${durationStr}`)}\n`);
    }
  } else {
    // Expanded: keep the streamed text in place and update only the known
    // header row with the final duration. Move back to the end of the block
    // afterwards so the next renderer starts at the correct cursor position.
    if (_thinkingHeaderPrinted) {
      const totalLines = _thinkingHeaderLineCount + _thinkingLinesPrinted;
      let output = `\x1B[${totalLines}A`;
      output += '\r\x1B[K' + `  ${C.muted('✻')} ${C.muted(`Thought for ${durationStr}`)}\n`;
      if (totalLines > _thinkingHeaderLineCount) {
        output += `\x1B[${totalLines - _thinkingHeaderLineCount}B`;
      }
      process.stdout.write(output);
    }
  }

  _thinkingHeaderPrinted = false;
  _thinkingHeaderLineCount = 0;
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
  console.log();
  console.log();

  if (!isVerbose) {
    // Collapsed: single ghost line — thinking is background noise
    process.stdout.write(`  ${C.ghost(`··· thought ${durationStr}`)}\n`);
    return;
  }

  // Verbose: muted header + full content (no truncation — every line is wrapped)
  process.stdout.write(`  ${C.muted('✻')} ${C.muted(`Thought for ${durationStr}`)}\n`);

  for (const rawLine of allLines) {
    for (const wrapped of wrapText(rawLine, innerWidth)) {
      if (wrapped.trim().length > 0) {
        process.stdout.write(`    ${C.muted(wrapped)}\n`);
      }
    }
  }
}
