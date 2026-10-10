// session-atomicity.test.js — a session write must be all-or-nothing
// (specs/2026-10-10-lifecycle-recovery-integrity, folded P2-12).
//
// saveSession and markAborted used a bare `fs.writeFileSync` over the whole
// file. A forced exit mid-write truncated the JSON — which the boot scan then
// reported as a corrupt session, i.e. the persistence layer manufactured the
// corruption the recovery layer exists to repair. Both now write a temp file,
// fsync it, then rename it over the target.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { config } from '../src/config.js';
import { saveSession, markAborted, getSessionRecord, deleteSession } from '../src/history.js';

const HISTORY_DIR = path.join(config.workspaceDir, '.emile', 'history');
const sessionFile = (id) => path.join(HISTORY_DIR, `${id}.json`);
const tempFile = (id) => `${sessionFile(id)}.tmp`;

/** Replaces a fs function with a thrower; returns a restore callback. */
function breakFs(name) {
  const original = fs[name];
  fs[name] = () => { throw new Error(`${name} failed (injected)`); };
  return () => { fs[name] = original; };
}

function sessionId(label) {
  return `test_atomic_${label}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

const messagesFor = (text) => [{ role: 'user', content: text }, { role: 'assistant', content: 'ok' }];

// ── AC-08: a failed write leaves the previous file intact ───────────────────

for (const failing of ['fsyncSync', 'renameSync']) {
  test(`a save whose ${failing} throws leaves the previous file byte-intact`, (t) => {
    const id = sessionId(failing);
    try {
      saveSession(id, 'first', messagesFor('first version'));
      const before = fs.readFileSync(sessionFile(id), 'utf8');
      assert.match(before, /first version/, 'fixture written');

      const restore = breakFs(failing);
      try {
        saveSession(id, 'second', messagesFor('second version'));
      } finally {
        restore();
      }

      assert.equal(fs.readFileSync(sessionFile(id), 'utf8'), before, 'the old bytes survived the failed save');
      assert.doesNotMatch(fs.readFileSync(sessionFile(id), 'utf8'), /second version/);
      assert.equal(fs.existsSync(tempFile(id)), false, 'no .tmp left behind');
      // The record is still readable and still describes the previous state.
      assert.equal(getSessionRecord(id).messages[1].content, 'ok');
    } finally {
      deleteSession(id);
      if (fs.existsSync(tempFile(id))) fs.unlinkSync(tempFile(id));
    }
  });
}

test('markAborted leaves the previous file intact when its write fails', (t) => {
  const id = sessionId('abort-fail');
  const toolCall = { id: 'call_1', type: 'function', function: { name: 'readFile', arguments: '{"filePath":"package.json"}' } };
  try {
    saveSession(id, 'checkpoint', messagesFor('work in progress'), { status: 'tool_pending', pendingToolCalls: [toolCall] });
    const before = fs.readFileSync(sessionFile(id), 'utf8');

    const restore = breakFs('renameSync');
    try {
      markAborted(id, 'shutdown');
    } finally {
      restore();
    }

    assert.equal(fs.readFileSync(sessionFile(id), 'utf8'), before, 'the checkpoint is untouched');
    assert.equal(fs.existsSync(tempFile(id)), false);
    const record = JSON.parse(before);
    assert.equal(record.aborted, undefined, 'the abort marker was not half-written');
  } finally {
    deleteSession(id);
  }
});

// ── AC-08: a successful write is clean ─────────────────────────────────────

test('a successful save leaves no temp file and parses back', (t) => {
  const id = sessionId('ok');
  try {
    saveSession(id, 'clean', messagesFor('hello'), { status: 'complete' });

    assert.equal(fs.existsSync(tempFile(id)), false, 'the temp file was renamed, not left behind');
    const parsed = JSON.parse(fs.readFileSync(sessionFile(id), 'utf8'));
    assert.equal(parsed.id, id);
    assert.equal(parsed.status, 'complete');
    assert.match(parsed.messages[0].content, /hello/);
    // Same directory as the target, so the rename is atomic and same-volume.
    assert.equal(path.dirname(tempFile(id)), HISTORY_DIR);
  } finally {
    deleteSession(id);
  }
});

test('a rewrite keeps the session id and the original createdAt', (t) => {
  const id = sessionId('rewrite');
  try {
    saveSession(id, 'v1', messagesFor('one'));
    const firstCreatedAt = JSON.parse(fs.readFileSync(sessionFile(id), 'utf8')).createdAt;

    saveSession(id, 'v2', messagesFor('two'));

    const after = JSON.parse(fs.readFileSync(sessionFile(id), 'utf8'));
    assert.equal(after.id, id);
    assert.equal(after.createdAt, firstCreatedAt, 'createdAt survives the atomic rewrite');
    assert.match(after.messages[0].content, /two/);
    assert.equal(fs.existsSync(tempFile(id)), false);
  } finally {
    deleteSession(id);
  }
});