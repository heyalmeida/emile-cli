// flush-memory.js — persist best-effort memory usage counters before shutdown.
// @ts-check
import { C } from '../ui/theme.js';

/** @returns {{ name: string, sliceMs: number, run(ctx: object): Promise<void> }} */
export function phase() {
  return {
    name: 'flush-memory',
    sliceMs: 250,
    async run({ verbose, flushMemory }) {
      if (!flushMemory) return;
      try {
        const result = await flushMemory();
        if (verbose) console.log(C.dim(`  [lifecycle] flush-memory: ${result?.changed ? 'saved' : 'idle'}`));
      } catch {
        if (verbose) console.log(C.warn('  [lifecycle] flush-memory: unavailable'));
      }
    },
  };
}
