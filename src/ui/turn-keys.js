// turn-keys.js — keyboard listener active while an agent turn is running.
//
// The REPL prompt is closed during a turn, so stdin would otherwise be
// paused and every keypress lost (Ctrl+C included — it would hit the global
// SIGINT handler and kill the CLI). This listener keeps raw mode on, turns
// Esc/Ctrl+C into a graceful cancel request and accumulates typed lines that
// are handed to the REPL queue on Enter.
import readline from 'node:readline';

const MAX_BUFFER_CHARS = 400;

/** Strips control characters and bounds a queued line before use. */
function sanitizeLine(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f\u0080-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_BUFFER_CHARS);
}

/**
 * Listens for keys while the agent works.
 * @param {object} options
 * @param {object} options.control Turn control from createTurnControl().
 * @param {(line: string) => void} [options.onLine] Called with a sanitized
 *   line when the user presses Enter.
 * @returns {() => void} Cleanup that restores the previous stdin state.
 */
export function listenTurnKeys({ control, onLine } = {}) {
  if (typeof process.stdin.setRawMode !== 'function' || process.stdin.isTTY === false) {
    return () => {};
  }

  const wasRaw = process.stdin.isRaw;
  process.stdin.setRawMode(true);
  process.stdin.resume();
  readline.emitKeypressEvents(process.stdin);

  let buffer = '';
  let finished = false;

  function cleanup() {
    if (finished) return;
    finished = true;
    process.stdin.removeListener('keypress', onKeypress);
    try { process.stdin.setRawMode(wasRaw); } catch { /* stdin may be gone */ }
    process.stdin.pause();
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
      if (line && typeof onLine === 'function') onLine(line);
      return;
    }
    if (key.name === 'backspace') {
      buffer = buffer.slice(0, -1);
      return;
    }
    // Ctrl+U clears the buffered line (editing happens without echo).
    if (key.ctrl && key.name === 'u') {
      buffer = '';
      return;
    }
    if (str && !key.ctrl && !key.meta && buffer.length < MAX_BUFFER_CHARS) {
      buffer += str;
    }
  }

  process.stdin.on('keypress', onKeypress);
  return cleanup;
}
