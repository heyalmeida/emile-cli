// close-mcp.js — phase 4: graceful shutdown of all MCP servers.
// @ts-check
import { C } from '../ui/theme.js';

/**
 * @typedef {object} PhaseContext
 * @property {boolean} verbose
 * @property {() => Promise<void>} shutdownMcp
 */

/** @returns {{ name: string, sliceMs: number, run(ctx: PhaseContext): Promise<void> }} */
export function phase() {
  return {
    name: 'close-mcp',
    sliceMs: 1000,
    async run({ verbose, shutdownMcp }) {
      if (!shutdownMcp) {
        if (verbose) console.log(C.dim(`  [lifecycle] close-mcp: not available`));
        return;
      }
      try {
        // The 1-second slice covers the graceful close + the per-server close in mcp.js.
        // If it exceeds the slice the coordinator short-circuits.
        const done = shutdownMcp();
        if (done && typeof done.then === 'function') {
          const timer = new Promise(r => setTimeout(r, 800));
          await Promise.race([done, timer]);
        }
        if (verbose) console.log(C.dim(`  [lifecycle] close-mcp: done`));
      } catch (err) {
        if (verbose) console.log(C.warn(`  [lifecycle] close-mcp: ${err.message}`));
      }
    },
  };
}
