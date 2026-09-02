// ──────────────────────────────────────────────────────────────
//  Animated Braille Spinner (zero dependencies)
//  Usage:
//    import { createSpinner } from './ui/spinner.js';
//    const s = createSpinner();
//    s.start('thinking...');
//    s.update('responding...');
//    s.stop('Done', '✓');
// ──────────────────────────────────────────────────────────────

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const INTERVAL_MS = 80;

/** Approved activity copy shown while the first response chunk is pending. */
export const RESPONSE_WAITING_LABEL = 'Thinking and responding…';

// Tokyo Night amber for thinking, muted gray for other states

// Opt-in diagnostic: log every stdout write to stderr with the
// pre/post cursor row. Activated by EMILE_DEBUG_THINKING=1 so the user
// can capture a real session without the log polluting the terminal.
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

const ESC = '\x1B';
function rgb(r, g, b) { return `${ESC}[38;2;${r};${g};${b}m`; }
const RESET = `${ESC}[0m`;
const amber = (s) => `${rgb(224,175,104)}${s}${RESET}`;   // #E0AF68
const muted = (s) => `${rgb(86,95,137)}${s}${RESET}`;     // #565F89
const green = (s) => `${rgb(158,206,106)}${s}${RESET}`;   // #9ECE6A
const red   = (s) => `${rgb(247,118,142)}${s}${RESET}`;   // #F7768E
const info  = (s) => `${rgb(125,207,255)}${s}${RESET}`;   // #7DCFFF

export function createSpinner() {
  let interval = null;
  let frameIndex = 0;
  let currentLabel = '';

  function render() {
    // Use amber color for "thinking..." label, muted otherwise
    const isThinking = currentLabel.toLowerCase().includes('thinking');
    const frame = isThinking ? amber(FRAMES[frameIndex]) : muted(FRAMES[frameIndex]);
    const label = isThinking ? amber(currentLabel) : muted(currentLabel);
    debugWrite('spinner.tick', `\r\x1B[K  ${frame} ${label}`); process.stdout.write(`\r\x1B[K  ${frame} ${label}`);
    frameIndex = (frameIndex + 1) % FRAMES.length;
  }

  return {
    start(label = 'Loading...') {
      currentLabel = label;
      frameIndex = 0;
      render();
      interval = setInterval(render, INTERVAL_MS);
      return this;
    },

    update(label) {
      currentLabel = label;
      return this;
    },

    stop(finalLabel = '', symbol = '✓') {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      let output = '\r\x1B[K';
      if (finalLabel) {
        const sym = symbol === '✓' ? green('✓')
                  : symbol === '✗' ? red('✗')
                  : symbol === 'ℹ' ? info('ℹ')
                  : muted(symbol);
        output += `  ${sym} ${muted(finalLabel)}\n`;
      }
      debugWrite('spinner.stop', output); process.stdout.write(output);
      return this;
    },
  };
}
