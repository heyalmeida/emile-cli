// restore-terminal.js — phase 6: leave the terminal in a clean, READABLE state.
//
// This phase deliberately does NOT clear the screen or home the cursor: the
// transcript above the prompt is the user's work, and erasing it on every exit
// destroyed it (a user-visible defect reported as part of P0-3). All this phase
// emits are the mode resets the shell needs — bracketed paste off, cursor
// visible, attributes reset — plus one newline so the shell prompt does not
// collide with the last rendered line.
//
// Raw mode is restored by the prompt teardown that phase 1 (stop-input) invokes;
// this phase handles the process-level ANSI cleanup only.
// @ts-check
import { C } from '../ui/theme.js';

/**
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
        process.stdout.write('\x1B[?2004l'); // exit bracketed paste
        process.stdout.write('\x1B[?25h');   // show cursor
        process.stdout.write('\x1B[0m');     // reset SGR / all attributes
        process.stdout.write('\n');          // keep the shell prompt off the last line
        if (verbose) console.log(C.dim(`  [lifecycle] restore-terminal: done`));
      } catch {
        // stdout may be gone; best-effort
      }
    },
  };
}