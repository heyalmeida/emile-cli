// ──────────────────────────────────────────────────────────────
//  Animated Braille Spinner (zero dependencies)
//  Usage:
//    import { createSpinner } from './ui/spinner.js';
//    const s = createSpinner();
//    s.start('thinking...');
//    s.update('responding...');
//    s.stop('Done', '✓');
// ──────────────────────────────────────────────────────────────
import { C, ROLE } from './theme.js';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const INTERVAL_MS = 80;

/** Approved activity copy shown while the first response chunk is pending. */
export const RESPONSE_WAITING_LABEL = 'Thinking and responding…';

// Colors come from the palette's ROLE layer — this module used to declare its
// own amber/muted/green/red/info helpers with hardcoded truecolor values, i.e. a
// SECOND palette that could drift from `C` (visual-identity § 1.1 "one palette,
// one source of truth"; P1-18 Stage A).

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



export function createSpinner() {
  let interval = null;
  let frameIndex = 0;
  let currentLabel = '';

  function render() {
    // The running role while the model reasons, the label step otherwise.
    const isThinking = currentLabel.toLowerCase().includes('thinking');
    const frame = isThinking ? ROLE.running(FRAMES[frameIndex]) : ROLE.meta.label(FRAMES[frameIndex]);
    const label = isThinking ? ROLE.running(currentLabel) : ROLE.meta.label(currentLabel);
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
        const sym = symbol === '✓' ? ROLE.success('✓')
                  : symbol === '✗' ? ROLE.error('✗')
                  : symbol === 'ℹ' ? C.info('ℹ')
                  : ROLE.meta.label(symbol);
        output += `  ${sym} ${ROLE.meta.label(finalLabel)}\n`;
      }
      debugWrite('spinner.stop', output); process.stdout.write(output);
      return this;
    },
  };
}
