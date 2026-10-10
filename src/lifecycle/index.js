// lifecycle/index.js — ordered shutdown coordinator.
//
// Each phase is a separate file so each has one clear reason to change.
// Phases run in order with a per-phase time slice; the global cap is 3 s.
// The coordinator is re-entrancy safe: a second signal sets the exit code
// and calls process.exit once.
//
// Usage in cli.js:
//
//   import { installShutdownHandlers } from './lifecycle/index.js';
//   installShutdownHandlers({
//     verbose: !!options.verbose,
//     shutdownMcp,   // from the dynamic import of mcp.js
//     flushSync,    // from history.js
//     flushMemory,  // from memory/index.js
//     markAborted,  // from history.js
//   });
//
// @ts-check
import { C } from '../ui/theme.js';
import { setPromptShutdown, isShuttingDown, setActiveTool, clearActiveTool } from './stop-input.js';

const PHASES = [
  import('./stop-input.js').then(m => m.phase()),
  import('./drain-tools.js').then(m => m.phase()),
  import('./flush-session.js').then(m => m.phase()),
  import('./flush-memory.js').then(m => m.phase()),
  import('./close-mcp.js').then(m => m.phase()),
  import('./restore-terminal.js').then(m => m.phase()),
];

/** Module-level: set on first signal, checked on subsequent signals. */
let _reEntrant = false;

/** Exit code for a signal, matching the shell convention. */
const exitCodeFor = (reason) => (reason === 'SIGINT' ? 130 : reason === 'SIGTERM' ? 143 : 1);

/** Exit seam: the second signal leaves synchronously, without running a phase. */
let forceExit = (reason) => process.exit(exitCodeFor(reason));

/** Test seam: swap the exit function; returns a restore callback. */
export function setForceExit(fn) {
  const previous = forceExit;
  forceExit = fn;
  return () => { forceExit = previous; };
}

/**
 * Re-entrancy guard: the first signal starts the phase loop, a second one is
 * escalated to a synchronous force-exit. The latch is set before any `await`, so
 * two signals in the same tick can never both start the loop.
 */
function guard(reason) {
  if (_reEntrant) { forceExit(reason); return true; }
  _reEntrant = true;
  return false;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Wire all shutdown handlers (SIGINT, SIGTERM, SIGHUP) and inject the prompt
 * shutdown so phase 1 can release the stdin lease.
 *
 * `markAborted(reason)` records the live session as interrupted — the caller owns
 * the session identity and no-ops when no turn is in flight. `shutdownPrompt()`
 * is optional so the coordinator works before a prompt exists.
 *
 * @param {{
 *   verbose: boolean,
 *   shutdownMcp: () => Promise<void>,
 *   flushSync: () => void,
 *   flushMemory?: () => Promise<object>,
 *   markAborted?: (reason: string) => void,
 *   shutdownPrompt?: () => void,
 * }} opts
 */
export function installShutdownHandlers({ verbose, shutdownMcp, flushSync, flushMemory, markAborted, shutdownPrompt }) {
  // Without an injected implementation there is nothing to tear down.
  setPromptShutdown(typeof shutdownPrompt === 'function' ? shutdownPrompt : () => {});

  const coordinator = async (reason) => {
    if (guard(reason)) return;

    const start = Date.now();
    const ctx = { verbose, shutdownMcp, flushSync, flushMemory, markAborted };

    for (const phasePromise of PHASES) {
      const phase = await phasePromise;
      const phaseStart = Date.now();

      if (verbose) {
        process.stdout.write(`\r\n${C.muted(`  [lifecycle] ${phase.name}\u2026`)}\n`);
      }

      try {
        const timeout = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`phase timeout: ${phase.name}`)), phase.sliceMs)
        );
        await Promise.race([phase.run(ctx), timeout]);
      } catch (err) {
        // Phase error is non-fatal; log and continue.
        if (verbose) {
          console.log(C.warn(`  [lifecycle] ${phase.name}: ${err.message}`));
        }
      }

      const elapsed = Date.now() - phaseStart;
      if (elapsed > phase.sliceMs && verbose) {
        console.log(C.warn(`  [lifecycle] \u26a0 ${phase.name} exceeded its ${phase.sliceMs}ms slice (${elapsed}ms)`));
      } else if (verbose) {
        console.log(C.dim(`  [lifecycle] ${phase.name}: ${elapsed}ms`));
      }
    }

    const total = Date.now() - start;
    if (verbose) {
      console.log(C.dim(`  [lifecycle] shutdown complete in ${total}ms`));
    }

    process.exit(exitCodeFor(reason));
  };

  process.on('SIGINT',  () => coordinator('SIGINT'));
  process.on('SIGTERM', () => coordinator('SIGTERM'));
  process.on('SIGHUP',  () => coordinator('SIGHUP'));

  // Exit handler: restore terminal on any exit path that bypassed the
  // coordinator (e.g. process.exit() called directly). Runs sync.
  process.on('exit', (code) => {
    // ANSI reset + cursor visible + no bracketed paste
    try { process.stdout.write('\x1B[?2004l\x1B[?25h\x1B[0m'); } catch { /* best-effort */ }
  });
}

/**
 * Export tool lifecycle hooks so agent.js can register the active tool
 * with the coordinator.
 */
export { isShuttingDown, setActiveTool, clearActiveTool };
