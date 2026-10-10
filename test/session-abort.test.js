// session-abort.test.js — recording an interrupted turn must not cost the user
// their resume (specs/2026-10-10-lifecycle-recovery-integrity, P0-3 § 10).
//
// markAborted used to set `status = 'aborted'`, which erased both the
// `tool_pending` marker and `pendingToolCalls` — destroying exactly the
// checkpoint `resumePendingTools` replays. It is now purely additive.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { config } from '../src/config.js';
import { saveSession, markAborted, getSessionRecord, deleteSession } from '../src/history.js';
import { resumePendingTools } from '../src/agent/agent.js';

const HISTORY_DIR = path.join(config.workspaceDir, '.emile', 'history');
const sessionFile = (id) => path.join(HISTORY_DIR, `${id}.json`);

const TOOL_CALL = {
  id: 'call_abort_1',
  type: 'function',
  function: { name: 'unknownTool', arguments: '{}' },
};

function newId(label) {
  return `test_abort_${label}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

// ── AC-04: additive abort ───────────────────────────────────────────────────

test('markAborted records the interruption without touching the checkpoint', (t) => {
  const id = newId('additive');
  try {
    saveSession(id, 'mid-tool', [{ role: 'user', content: 'list' }], {
      status: 'tool_pending',
      pendingToolCalls: [TOOL_CALL],
    });

    markAborted(id, 'shutdown-interrupted-tool');

    const record = getSessionRecord(id);
    assert.equal(record.status, 'tool_pending', 'the record is STILL resumable');
    assert.equal(record.aborted, true, 'the interruption is recorded');
    assert.equal(record.abortReason, 'shutdown-interrupted-tool', 'the reason is plumbed through');

    // The raw file (not just the normalized read) must keep the checkpoint.
    const raw = JSON.parse(fs.readFileSync(sessionFile(id), 'utf8'));
    assert.equal(raw.status, 'tool_pending', 'on disk, status was never rewritten to "aborted"');
    assert.equal(raw.aborted, true);
    assert.equal(raw.abortReason, 'shutdown-interrupted-tool');
    assert.equal(raw.pendingToolCalls.length, 1, 'pendingToolCalls survived');
    assert.deepEqual(raw.pendingToolCalls[0], TOOL_CALL);
  } finally {
    deleteSession(id);
  }
});

test('an aborted checkpoint still replays only its missing tool results', async (t) => {
  const id = newId('resume');
  try {
    saveSession(id, 'mid-tool', [{ role: 'user', content: 'read it' }], {
      status: 'tool_pending',
      pendingToolCalls: [TOOL_CALL],
    });
    markAborted(id, 'shutdown');

    const record = getSessionRecord(id);
    const messages = [{ role: 'user', content: 'read it' }];
    const checkpoints = [];

    const recovery = await resumePendingTools({
      messages,
      pendingToolCalls: record.pendingToolCalls,
      checkpointSession: async (_messages, metadata) => { checkpoints.push(metadata.status); },
    });

    assert.deepEqual(recovery, { resumed: true, invalid: false }, 'the aborted checkpoint is replayable');
    assert.equal(messages.filter((m) => m.role === 'tool').length, 1, 'the missing result was produced');
    assert.equal(messages.at(-1).tool_call_id, TOOL_CALL.id, 'paired with the pending call');
    assert.deepEqual(checkpoints, ['tool_pending'], 'progress is checkpointed as still pending');

    // Running the replay again must not duplicate anything.
    const second = await resumePendingTools({
      messages,
      pendingToolCalls: record.pendingToolCalls,
      checkpointSession: async () => { throw new Error('must not checkpoint again'); },
    });
    assert.deepEqual(second, { resumed: false, invalid: false });
    assert.equal(messages.filter((m) => m.role === 'tool').length, 1, 'idempotent replay');
  } finally {
    deleteSession(id);
  }
});

test('markAborted is additive on a complete session too', (t) => {
  const id = newId('complete');
  try {
    saveSession(id, 'done', [{ role: 'user', content: 'hi' }], { status: 'complete' });
    markAborted(id, 'shutdown');

    const raw = JSON.parse(fs.readFileSync(sessionFile(id), 'utf8'));
    assert.equal(raw.status, 'complete', 'a finished session is not retroactively made "aborted"');
    assert.equal(raw.aborted, true, 'but the interruption is still recorded');
  } finally {
    deleteSession(id);
  }
});

test('markAborted on a missing session is a silent no-op', (t) => {
  const id = newId('missing');
  assert.equal(fs.existsSync(sessionFile(id)), false);
  assert.doesNotThrow(() => markAborted(id, 'shutdown'));
  assert.equal(fs.existsSync(sessionFile(id)), false, 'it does not create the file');
});

test('markAborted defaults the reason when none is given', (t) => {
  const id = newId('default');
  try {
    saveSession(id, 'x', [{ role: 'user', content: 'hi' }], { status: 'tool_pending', pendingToolCalls: [TOOL_CALL] });
    markAborted(id);
    const raw = JSON.parse(fs.readFileSync(sessionFile(id), 'utf8'));
    assert.equal(raw.abortReason, 'shutdown');
    assert.equal(raw.status, 'tool_pending');
  } finally {
    deleteSession(id);
  }
});