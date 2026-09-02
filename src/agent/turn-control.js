// turn-control.js — cooperative cancel/queue control for agent turns.
//
// The REPL keeps listening for keys while the agent runs. Esc/Ctrl+C call
// requestStop() and typed lines are pushed to the queue. The agent loop polls
// shouldStop() at safe boundaries (between iterations, stream chunks and tool
// executions) and stops gracefully; cli.js drains the queue between turns.

/**
 * Creates a fresh control object for one agent turn.
 * @returns {{
 *   requestStop(reason?: string): void,
 *   shouldStop(): boolean,
 *   stopReason(): string|null,
 *   readonly signal: AbortSignal,
 *   reset(): void,
 * }}
 */
export function createTurnControl() {
  let stopped = false;
  let reason = null;
  // Aborts the in-flight HTTP request. Without this, a cancel only takes
  // effect at the next stream chunk — a provider stalled in "thinking"
  // (no chunks) would keep the turn hanging for minutes.
  let abortController = new AbortController();
  return {
    requestStop(nextReason = 'user') {
      stopped = true;
      reason = nextReason;
      try { abortController.abort(); } catch { /* already aborted */ }
    },
    shouldStop() {
      return stopped;
    },
    stopReason() {
      return reason;
    },
    get signal() {
      return abortController.signal;
    },
    reset() {
      stopped = false;
      reason = null;
      if (abortController.signal.aborted) {
        abortController = new AbortController();
      }
    },
  };
}
