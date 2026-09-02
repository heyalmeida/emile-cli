// stop-input.js — phase 1: stop accepting new input and set the shutting-down flag.
// @ts-check
/**
 * @typedef {object} PhaseContext
 * @property {boolean} verbose
 */

/** @returns {{ name: string, sliceMs: number, run(ctx: PhaseContext): Promise<void> }} */
export function phase() {
  return {
    name: 'stop-input',
    sliceMs: 50,
    async run({ verbose }) {
      // The module-level flag prevents new turns from starting while the
      // coordinator drains the active one. It is set before any async work
      // so a second signal arriving before the first phase completes is
      // a no-op (the coordinator checks it on entry).
      shuttingDown = true;

      // Prevent the persistent prompt from rendering / accepting more keystrokes.
      // The function is sync; any async cleanup (readline stream teardown) is
      // best-effort — we do not await it here.
      try { shutdownPrompt?.(); } catch { /* stdin may be gone */ }

      if (verbose) console.log(C.dim(`  [lifecycle] stop-input done`));
    },
  };
}

// ── Shared state ─────────────────────────────────────────────────────────────

/** Set by installShutdownHandlers(); consumed by phase 2 to know if a tool is active. */
let currentToolController = null;
/** Set by installShutdownHandlers(); consumed by phase 2 to wait for the active tool. */
let currentToolWaiter = null;
/** Resolved by runAgentInner when a tool starts; consumed by phase 2 to wait for it. */
let resolveToolWaiter = null;

/**
 * Called by runAgentInner when a tool call begins. Returns a controller
 * the drain phase can use to abort the in-flight tool.
 * @param {{ requestStop(reason: string): void, get signal(): AbortSignal }} controller
 */
export function setActiveTool(controller) {
  currentToolController = controller;
  if (resolveToolWaiter) {
    resolveToolWaiter(controller);
    resolveToolWaiter = null;
    currentToolWaiter = null;
  }
}

/**
 * Called by runAgentInner when the active tool finishes (success or error).
 * Clears the in-flight state so the drain phase knows there is nothing to abort.
 */
export function clearActiveTool() {
  currentToolController = null;
  currentToolWaiter = null;
  resolveToolWaiter = null;
}

/** Returns a promise that resolves when the next tool starts, or the already-active one. */
export function waitForActiveTool() {
  if (currentToolController) return Promise.resolve(currentToolController);
  if (!currentToolWaiter) {
    currentToolWaiter = new Promise(r => { resolveToolWaiter = r; });
  }
  return currentToolWaiter;
}

/** Module-level flag; set by phase 1, checked by cli.js before starting a new turn. */
let shuttingDown = false;
export function isShuttingDown() { return shuttingDown; }

/** Injected by installShutdownHandlers(). */
let shutdownPrompt = null;
export function setPromptShutdown(fn) { shutdownPrompt = fn; }

import { C } from '../ui/theme.js';
