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
 *   reset(): void,
 * }}
 */
export function createTurnControl() {
  let stopped = false;
  let reason = null;
  return {
    requestStop(nextReason = 'user') {
      stopped = true;
      reason = nextReason;
    },
    shouldStop() {
      return stopped;
    },
    stopReason() {
      return reason;
    },
    reset() {
      stopped = false;
      reason = null;
    },
  };
}
