/**
 * agent/index.js — public barrel of the agent/ module tree.
 *
 * Former src/agent.js was decomposed into agent.js (loop), session-stats.js
 * and compression.js. This barrel keeps the public import surface stable.
 */
export { runAgent, resumePendingTools, FREE_FALLBACK_MODEL, isPaidModel } from './agent.js';
export { sessionStats, calculateCost, getContextLimit, calculateContextUsage, initSessionStats } from './session-stats.js';
export { compressContextIfNeeded } from './compression.js';
export { countCompletedTurns, refreshSessionSummary } from './session-summary.js';
