import test from 'node:test';
import assert from 'node:assert/strict';

import { dispatchCommand, hasCommand, listCommands } from '../src/commands/index.js';

const expectedCommands = [
  '/connect', '/model', '/switch', '/sessions', '/new', '/clear',
  '/rewind', '/thinking', '/help', '/undo', '/cost', '/export', '/rules',
];

test('registry contains every existing slash command and aliases', () => {
  assert.deepEqual(listCommands(), expectedCommands);
  for (const command of expectedCommands) assert.equal(hasCommand(command), true);
});

test('unknown slash-like input is not dispatched', async () => {
  let invoked = false;
  const handled = await dispatchCommand('/unknown', {
    getMessages: () => [],
    setMessages: () => { invoked = true; },
  });

  assert.equal(handled, false);
  assert.equal(invoked, false);
});

test('new-session handler mutates only the explicit session state', async () => {
  const state = {
    messages: [{ role: 'user', content: 'old' }],
    sessionId: 'old-session',
    summary: 'old summary',
  };
  const ctx = {
    setMessages: (messages) => { state.messages = messages; },
    setSessionId: (sessionId) => { state.sessionId = sessionId; },
    setSessionSummary: (summary) => { state.summary = summary; },
  };

  const handled = await dispatchCommand('/new', ctx);

  assert.equal(handled, true);
  assert.deepEqual(state.messages, []);
  assert.notEqual(state.sessionId, 'old-session');
  assert.equal(state.summary, '');
});

test('thinking handler toggles the shared visibility state', async () => {
  const config = { expandThinking: true };
  const handled = await dispatchCommand('/thinking', { config });

  assert.equal(handled, true);
  assert.equal(config.expandThinking, false);
});

test('undo dispatch accepts an optional count', async () => {
  const workspaceDir = process.cwd();
  const handled = await dispatchCommand('/undo 3', {
    undoStack: [
      { path: `${workspaceDir}/one`, content: '' },
      { path: `${workspaceDir}/two`, content: '' },
      { path: `${workspaceDir}/three`, content: '' },
      { path: `${workspaceDir}/four`, content: '' },
    ],
    config: { workspaceDir },
    confirmUndo: async () => false,
  });

  assert.equal(handled, true);
});
