import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { preparePersistedMessages } from '../src/history.js';
import { handleExport } from '../src/commands/handlers.js';

test('persisted message projection removes reasoning without mutating live history', () => {
  const messages = [
    { role: 'user', content: 'question' },
    {
      role: 'assistant',
      content: 'answer',
      reasoning_content: 'private thought',
      tool_calls: [{ id: 'call_1', function: { name: 'readFile', arguments: '{}' } }],
    },
  ];

  const persisted = preparePersistedMessages(messages);

  assert.equal(persisted[1].reasoning_content, undefined);
  assert.equal(messages[1].reasoning_content, 'private thought');
  assert.deepEqual(persisted[1].tool_calls, messages[1].tool_calls);
});

test('persisted projection redacts memory tool arguments and results', () => {
  const messages = [
    {
      role: 'assistant', content: null,
      tool_calls: [{ id: 'memory_1', function: { name: 'recallMemory', arguments: '{"query":"private preference"}' } }],
    },
    { role: 'tool', tool_call_id: 'memory_1', content: 'private preference from global memory' },
  ];
  const persisted = preparePersistedMessages(messages);
  assert.equal(persisted[0].tool_calls[0].function.arguments, '{"omitted":true}');
  assert.equal(persisted[1].content, '[global memory tool result omitted from session storage]');
  assert.match(messages[1].content, /private preference/);
});

async function exportedMarkdown({ includeThinking }) {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emile-export-'));
  try {
    await handleExport({
      config: { workspaceDir, defaultModel: 'test/model' },
      options: { exportThinking: includeThinking },
      getMessages: () => [{ role: 'assistant', content: 'answer', reasoning_content: 'private thought' }],
      getSessionId: () => 'session-test',
    });
    const filename = fs.readdirSync(workspaceDir).find(name => name.startsWith('emile-session-'));
    return fs.readFileSync(path.join(workspaceDir, filename), 'utf8');
  } finally {
    const files = fs.existsSync(workspaceDir) ? fs.readdirSync(workspaceDir) : [];
    for (const file of files) fs.unlinkSync(path.join(workspaceDir, file));
    fs.rmdirSync(workspaceDir);
  }
}

test('export omits reasoning by default and includes it only with opt-in', async () => {
  const withoutThinking = await exportedMarkdown({ includeThinking: false });
  const withThinking = await exportedMarkdown({ includeThinking: true });

  assert.doesNotMatch(withoutThinking, /private thought/);
  assert.match(withThinking, /private thought/);
});
