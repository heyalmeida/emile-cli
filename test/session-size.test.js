import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { cleanSessions, trimPersistedMessages } from '../src/history.js';

test('trims oldest tool results in the persisted copy only', () => {
  const messages = [
    { role: 'system', content: 'system' },
    { role: 'tool', content: 'old output '.repeat(20) },
    { role: 'assistant', content: 'answer' },
    { role: 'tool', content: 'new output '.repeat(20) },
  ];
  const result = trimPersistedMessages(messages, 220);

  assert.equal(result.trimmed, true);
  assert.equal(result.messages[1].content, '[truncated]');
  assert.equal(messages[1].content.startsWith('old output'), true);
});

test('cleans only sessions older than the requested age', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'emile-sessions-'));
  try {
    const old = { id: 'old', updatedAt: new Date(Date.now() - 10 * 86400000).toISOString() };
    const recent = { id: 'recent', updatedAt: new Date().toISOString() };
    fs.writeFileSync(path.join(directory, 'old.json'), JSON.stringify(old));
    fs.writeFileSync(path.join(directory, 'recent.json'), JSON.stringify(recent));

    assert.deepEqual(cleanSessions(7, { directory }), { deleted: 1, invalid: false });
    assert.equal(fs.existsSync(path.join(directory, 'old.json')), false);
    assert.equal(fs.existsSync(path.join(directory, 'recent.json')), true);
    assert.equal(cleanSessions('invalid', { directory }).invalid, true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
