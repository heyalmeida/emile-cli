// ──────────────────────────────────────────────────────────────
//  Animated Braille Spinner (zero dependencies)
//  Usage:
//    import { createSpinner } from './spinner.js';
//    const s = createSpinner();
//    s.start('thinking...');
//    s.update('responding...');
//    s.stop('Done', '✓');
// ──────────────────────────────────────────────────────────────

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const INTERVAL_MS = 80;

// Tokyo Night amber for thinking, muted gray for other states
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
    process.stdout.write('\r\x1B[K');
    // Use amber color for "thinking..." label, muted otherwise
    const isThinking = currentLabel.includes('thinking');
    const frame = isThinking ? amber(FRAMES[frameIndex]) : muted(FRAMES[frameIndex]);
    const label = isThinking ? amber(currentLabel) : muted(currentLabel);
    process.stdout.write(`  ${frame} ${label}`);
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
      process.stdout.write('\r\x1B[K');
      if (finalLabel) {
        const sym = symbol === '✓' ? green('✓')
                  : symbol === '✗' ? red('✗')
                  : symbol === 'ℹ' ? info('ℹ')
                  : muted(symbol);
        process.stdout.write(`  ${sym} ${muted(finalLabel)}\n`);
      }
      return this;
    },
  };
}
