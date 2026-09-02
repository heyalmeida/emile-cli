// restore-terminal.js — phase 5: reset terminal to a clean, readable state.
// @ts-check
import { C } from '../ui/theme.js';

/**
 * Exit bracketed-paste, show cursor, leave raw mode already handled
 * by prompt-input-persistent.js shutdown(). This phase handles the final
 * ANSI cleanup that belongs to the process level, not any individual module.
 *
 * @typedef {object} PhaseContext
 * @property {boolean} verbose
 */

/** @returns {{ name: string, sliceMs: number, run(ctx: PhaseContext): Promise<void> }} */
export function phase() {
  return {
    name: 'restore-terminal',
    sliceMs: 100,
    async run({ verbose }) {
      try {
        // Reset: bracketed-paste off, cursor visible, all attributes reset.
        process.stdout.write('\x1B[?2004l'); // exit bracketed paste
        process.stdout.write('\x1B[?25h');   // show cursor
        process.stdout.write('\x1B[0m');     // reset SGR / all attributes
        process.stdout.write('\x1B[2J');    // clear screen (ANSI)
        process.stdout.write('\x1B[H');      // move to home
        if (verbose) console.log(C.dim(`  [lifecycle] restore-terminal: done`));
      } catch {
        // stdout may be gone; best-effort
      }
    },
  };
}
