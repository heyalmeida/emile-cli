// session-stats-persistence.test.js — verifies /cost metadata follows the
// active saved session instead of the lifetime of one CLI process.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getSessionStatsSnapshot,
  resetSessionStats,
  restoreSessionStats,
  sessionStats,
} from '../src/agent/session-stats.js';
import { deleteSession, getSessionRecord, saveSession } from '../src/history.js';

const usage = {
  promptTokens: 120,
  completionTokens: 30,
  totalCost: 0.0042,
  cachedPromptTokens: 20,
  lastPromptTokens: 120,
  lastCompletionTokens: 30,
};

test('session stats snapshot restores only bounded cumulative counters', () => {
  resetSessionStats();
  Object.assign(sessionStats, usage);
  const snapshot = getSessionStatsSnapshot();

  resetSessionStats();
  assert.equal(sessionStats.promptTokens, 0);
  assert.equal(sessionStats.totalCost, 0);

  restoreSessionStats(snapshot);
  assert.equal(sessionStats.promptTokens, 120);
  assert.equal(sessionStats.completionTokens, 30);
  assert.equal(sessionStats.cachedPromptTokens, 20);
  assert.equal(sessionStats.totalCost, 0.0042);

  restoreSessionStats({ promptTokens: -1, completionTokens: 'bad', totalCost: Infinity });
  assert.equal(sessionStats.promptTokens, 0);
  assert.equal(sessionStats.completionTokens, 0);
  assert.equal(sessionStats.totalCost, 0);
  resetSessionStats();
});

test('session history persists and reloads the usage snapshot', () => {
  const sessionId = `test_session_stats_${Date.now()}`;
  try {
    saveSession(sessionId, 'usage', [{ role: 'user', content: 'hello' }], { stats: usage });
    const record = getSessionRecord(sessionId);
    assert.equal(record.stats.promptTokens, 120);
    assert.equal(record.stats.completionTokens, 30);
    assert.equal(record.stats.cachedPromptTokens, 20);
    assert.equal(record.stats.totalCost, 0.0042);

    saveSession(sessionId, 'usage', [{ role: 'user', content: 'hello again' }]);
    assert.equal(getSessionRecord(sessionId).stats.promptTokens, 120, 'a metadata-less save preserves stats');
  } finally {
    deleteSession(sessionId);
  }
});

test('legacy session records without stats remain loadable', () => {
  const sessionId = `test_session_stats_legacy_${Date.now()}`;
  try {
    saveSession(sessionId, 'legacy', [{ role: 'user', content: 'old' }]);
    assert.equal(getSessionRecord(sessionId).stats, null);
  } finally {
    deleteSession(sessionId);
  }
});
