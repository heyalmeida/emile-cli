/**
 * turn-state.js — shared per-turn UI state.
 *
 * Isolates the mutable cross-component counter (tools executed in the
 * current turn) used by tool-lines (increment), user-message (reset on a
 * new command) and response (consume to render the `↳ N tools` header).
 * A dedicated module keeps this shared state visible instead of buried
 * inside one of the consumers.
 */
export const turnState = {
  toolsRun: 0,
};
