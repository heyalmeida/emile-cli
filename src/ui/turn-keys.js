// turn-keys.js — live input prompt that stays visible while the agent works.
//
// Design
// ------
// The agent's stream may write many lines (spinner, thinking, tool summary,
// response). Reserving a fixed row at the start of the turn drifts as the
// agent outputs more lines and ends up overlapping the live input.
//
// We do not reserve a fixed row. Instead, the live input is always drawn
// one line *below the current cursor*, using save/restore cursor (ESC7/ESC8)
// so the agent's stdout position is never disturbed. Every keypress moves
// the cursor down by one row, erases the previous input line, and writes
// the new buffer in place. The agent output remains untouched above.
//
// Esc / Ctrl+C cancel the turn, Enter commits the line to the queue, and
// ordinary characters fill the buffer with a hard cap.
import readline from 'node:readline';

const MAX_BUFFER_CHARS = 400;

/** Strips control characters and bounds a queued line before use. */
function sanitizeLine(value) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f\u0080-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_BUFFER_CHARS);
}

function bufferDisplay(buffer, columns) {
  const placeholder = 'type a message and press Enter to queue';
  const text = buffer.length > 0 ? buffer : placeholder;
  const maxLength = Math.max(10, (columns || 80) - 6);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

/**
 * Draws a one-line input row on the line below the current cursor and
 * returns a handle with redraw/hide that preserves the cursor position.
 */
function createLiveInput() {
  const enabled = process.stdout.isTTY !== false;
  let drawn = false;

  function drawRow(buffer) {
    if (!enabled) return;
    const columns = process.stdout.columns || 80;
    const text = bufferDisplay(buffer, columns);
    const dim = !process.stdout.isTTY;
    const glyph = dim ? '> ' : '\x1b[38;2;122;162;247m❯\x1b[0m';
    // Save the cursor, drop a line, write the row, restore the cursor.
    // Subsequent draws only need to erase + write the row.
    if (!drawn) {
      process.stdout.write('\x1B7');      // save cursor
      process.stdout.write('\n');           // reserve a row
      process.stdout.write(`\r  ${glyph} ${text}`);
      process.stdout.write('\x1B8');      // restore cursor
      drawn = true;
    } else {
      process.stdout.write('\x1B7');      // save cursor
      process.stdout.write('\x1B[1B');     // move to the input row
      process.stdout.write('\r\x1B[K');     // erase the line
      process.stdout.write(`  ${glyph} ${text}`);
      process.stdout.write('\x1B8');      // restore cursor
    }
  }

  function hideRow() {
    if (!enabled || !drawn) return;
    process.stdout.write('\x1B7');
    process.stdout.write('\x1B[1B\r\x1B[K');
    process.stdout.write('\x1B8');
    drawn = false;
  }

  return {
    enabled,
    draw: drawRow,
    hide: hideRow,
  };
}

/**
 * Listens for keys while the agent works and maintains a live input row.
 *
 * @param {object} options
 * @param {object} options.control Turn control from createTurnControl().
 * @param {(line: string) => void} [options.onLine] Called with a sanitized
 *   line when the user presses Enter.
 * @returns {{ stop: () => void, redraw: () => void }} `stop()` cleans up
 *   stdin and removes the input row; `redraw()` re-anchors the row at the
 *   current cursor so the CLI can call it after each agent write.
 */
export function listenTurnKeys({ control, onLine } = {}) {
  if (typeof process.stdin.setRawMode !== 'function' || process.stdin.isTTY === false) {
    return { stop: () => {}, redraw: () => {} };
  }

  const wasRaw = process.stdin.isRaw;
  process.stdin.setRawMode(true);
  process.stdin.resume();
  readline.emitKeypressEvents(process.stdin);

  let buffer = '';
  let finished = false;
  const live = createLiveInput();

  function repaint() {
    live.draw(buffer);
  }

  repaint(); // initial draw

  function cleanup() {
    if (finished) return;
    finished = true;
    process.stdin.removeListener('keypress', onKeypress);
    try { process.stdin.setRawMode(wasRaw); } catch { /* stdin may be gone */ }
    process.stdin.pause();
    live.hide();
  }

  function onKeypress(str, key = {}) {
    if (key.ctrl && key.name === 'c') {
      control?.requestStop('interrupt');
      return;
    }
    if (key.name === 'escape') {
      control?.requestStop('interrupt');
      return;
    }
    if (key.name === 'return' || key.name === 'enter') {
      const line = sanitizeLine(buffer);
      buffer = '';
      repaint();
      if (line && typeof onLine === 'function') onLine(line);
      return;
    }
    if (key.name === 'backspace') {
      buffer = buffer.slice(0, -1);
      repaint();
      return;
    }
    if (key.ctrl && key.name === 'u') {
      buffer = '';
      repaint();
      return;
    }
    if (str && !key.ctrl && !key.meta && buffer.length < MAX_BUFFER_CHARS) {
      buffer += str;
      repaint();
    }
  }

  process.stdin.on('keypress', onKeypress);
  return {
    stop: cleanup,
    redraw: repaint,
  };
}
