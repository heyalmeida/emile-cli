// drain-tools.js — phase 2: wait for the active tool to finish, or abort it.
// @ts-check
import { waitForActiveTool, clearActiveTool } from './stop-input.js';
import { C } from '../ui/theme.js';

/**
 * @typedef {object} PhaseContext
 * @property {boolean} verbose
 * @property {(id: string, reason: string) => void} markAborted
 */

/** @returns {{ name: string, sliceMs: number, run(ctx: PhaseContext): Promise<void> }} */
export function phase() {
  return {
    name: 'drain-tools',
    sliceMs: 1500,
    async run({ verbose, markAborted }) {
      const controller = await waitForActiveTool();
      if (!controller) {
        if (verbose) console.log(C.dim(`  [lifecycle] drain-tools: no tool in flight`));
        return;
      }

      // Wait up to 1500 ms for the tool to complete on its own.
      // The tool's underlying HTTP/MCP call must honour the AbortSignal.
      const timeout = new Promise(resolve => setTimeout(resolve, 1200));
      await Promise.race([
        // The signal fires when runAgentInner receives shouldStop() via the
        // cancel path (Esc/Ctrl+C) and aborts the HTTP request.
        // The tool handler should see the abort and clean up within its own timeout.
        new Promise(resolve => {
          if (controller.signal?.aborted) { resolve('aborted'); return; }
          controller.signal?.addEventListener('abort', () => resolve('aborted'), { once: true });
        }),
        timeout,
      ]);

      if (controller.signal?.aborted) {
        if (verbose) console.log(C.dim(`  [lifecycle] drain-tools: tool aborted by cancel`));
      } else {
        // Still running after 1200 ms — mark it and abort the underlying request.
        // phase 3 will flush the session with the aborted result.
        if (verbose) console.log(C.dim(`  [lifecycle] drain-tools: tool exceeded drain window, aborting`));
        try { controller.requestStop('shutdown'); } catch { /* best-effort */ }
        // Give the abort 200 ms to propagate to the handler before we exit.
        await new Promise(r => setTimeout(r, 200));
      }

      clearActiveTool();
    },
  };
}
