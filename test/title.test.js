import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_TERMINAL_TITLE_LENGTH,
  canWriteTerminalTitle,
  configureTerminalTitle,
  createTerminalTitleSequence,
  describeToolActivity,
  formatTerminalTitle,
  getCurrentTerminalTitle,
  sanitizeTitlePart,
  setTerminalActivity,
  writeTerminalTitle,
} from '../src/ui/title.js';

test('formats an activity-first title with stable workspace and model identity', () => {
  assert.equal(
    formatTerminalTitle({
      activity: 'thinking',
      workspace: '/work/projects/emile-cli',
      model: 'anthropic/claude-sonnet-4',
    }),
    'thinking · emile · emile-cli · claude-sonnet-4',
  );
});

test('strips terminal controls and bounds the complete title', () => {
  const injected = '\x1B]0;spoof\x07thinking\x1B[31m\nnext\roverwrite';
  const sanitized = sanitizeTitlePart(injected, 80);
  const sequence = createTerminalTitleSequence(injected);

  assert.equal(sanitized, 'thinking nextoverwrite');
  assert.equal(sequence, '\x1B]0;thinking nextoverwrite\x07');
  assert.equal((sequence.match(/\x1B/g) || []).length, 1);
  assert.equal(formatTerminalTitle({ activity: 'x'.repeat(200) }).length <= MAX_TERMINAL_TITLE_LENGTH, true);
});

test('guards terminal writes and emits one bounded OSC sequence on a supported TTY', () => {
  assert.equal(canWriteTerminalTitle({ isTTY: false, term: 'xterm-256color' }), false);
  assert.equal(canWriteTerminalTitle({ isTTY: true, term: 'dumb' }), false);

  const writes = [];
  const tty = { isTTY: true, write: (value) => writes.push(value) };
  const pipe = { isTTY: false, write: (value) => writes.push(value) };
  assert.equal(writeTerminalTitle('waiting', { stdout: pipe, term: 'xterm' }), false);
  assert.equal(writeTerminalTitle('waiting', { stdout: tty, term: 'xterm' }), true);
  assert.deepEqual(writes, ['\x1B]0;waiting\x07']);
});

test('describes built-in tool activity without leaking command or search arguments', () => {
  const read = describeToolActivity({
    function: { name: 'readFile', arguments: JSON.stringify({ path: '/work/src/agent/agent.js' }) },
  });
  const command = describeToolActivity({
    function: { name: 'runCommand', arguments: JSON.stringify({ command: 'deploy --token super-secret' }) },
  });
  const search = describeToolActivity({
    function: { name: 'grepSearch', arguments: JSON.stringify({ query: 'super-secret' }) },
  });

  assert.equal(read, 'reading agent/agent.js');
  assert.equal(command, 'running command');
  assert.equal(search, 'searching code');
  assert.equal(command.includes('super-secret'), false);
  assert.equal(search.includes('super-secret'), false);

  const cases = [
    ['writeFile', { path: '/work/src/output.js' }, 'writing src/output.js'],
    ['editFile', { path: '/work/src/output.js' }, 'editing src/output.js'],
    ['listDir', { path: '/work/private' }, 'listing files'],
    ['findFiles', { pattern: 'private-token' }, 'finding files'],
    ['createPlan', { secret: 'not-visible' }, 'creating plan'],
    ['updateTask', { secret: 'not-visible' }, 'updating plan'],
  ];
  for (const [name, args, expected] of cases) {
    assert.equal(
      describeToolActivity({ function: { name, arguments: JSON.stringify(args) } }),
      expected,
    );
  }
});

test('sanitizes MCP and unknown tool names', () => {
  assert.equal(
    describeToolActivity({ function: { name: 'mcp__github__create_pull_request', arguments: '{}' } }),
    'using create pull request',
  );
  assert.equal(
    describeToolActivity({ function: { name: '\x1B]0;spoof\x07custom-tool', arguments: 'not-json' } }),
    'using custom tool',
  );
});

test('agent wrapper restores waiting after an unexpected failure', async () => {
  const { runAgent } = await import('../src/agent/index.js');
  configureTerminalTitle({ workspace: '/work/emile-cli', model: 'test/model' });
  setTerminalActivity('broken state');

  await assert.rejects(() => runAgent({
    model: 'test/model',
    plansMode: false,
    skills: [],
    cache: false,
    effort: 'low',
    messages: null,
  }));

  assert.equal(getCurrentTerminalTitle(), 'waiting · emile · emile-cli · model');
});

test('context compression reports its runtime activity when the gate runs', async () => {
  const { compressContextIfNeeded } = await import('../src/agent/compression.js');
  const messages = [
    { role: 'system', content: 'system' },
    ...Array.from({ length: 10 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `message-${index}-` + 'x'.repeat(5_000),
    })),
  ];
  const originalWrite = process.stdout.write;
  process.stdout.write = () => true;
  try {
    const compressed = await compressContextIfNeeded({
      model: 'test/model',
      messages,
      contextTokens: 110_000,
      contextLimit: 128_000,
      createCompletion: async () => ({ choices: [{ message: { content: 'summary' } }] }),
    });
    assert.equal(compressed, true);
    assert.match(getCurrentTerminalTitle(), /^compressing context ·/);
  } finally {
    process.stdout.write = originalWrite;
  }
});
