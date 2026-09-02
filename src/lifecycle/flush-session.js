// flush-session.js — phase 3: synchronously fsync the session checkpoint.
// @ts-check
import { C } from '../ui/theme.js';

/**
 * @typedef {object} PhaseContext
 * @property {boolean} verbose
 * @property {() => void} flushSync
 */

/** @returns {{ name: string, sliceMs: number, run(ctx: PhaseContext): Promise<void> }} */
export function phase() {
  return {
    name: 'flush-session',
    sliceMs: 300,
    async run({ verbose, flushSync }) {
      if (!flushSync) {
        if (verbose) console.log(C.dim(`  [lifecycle] flush-session: no flushSync available`));
        return;
      }
      try {
        flushSync();
        if (verbose) console.log(C.dim(`  [lifecycle] flush-session: session checkpoint written`));
      } catch (err) {
        // Best-effort: a failed flush must not prevent the remaining phases.
        if (verbose) console.log(C.warn(`  [lifecycle] flush-session: ${err.message}`));
      }
    },
  };
}
