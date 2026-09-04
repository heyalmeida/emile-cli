import test from 'node:test';
import assert from 'node:assert/strict';

import { dispatchCommand, hasCommand, listCommands } from '../src/commands/index.js';

const expectedCommands = [
  '/connect', '/model', '/switch', '/sessions', '/new', '/clear',
  '/rewind', '/thinking', '/maxloop', '/websearch', '/tavily', '/firecrawl',
  '/help', '/undo', '/cost', '/export', '/rules', '/skills', '/skill',
  '/memory', '/remember', '/forget',
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

test('/skills is a registered read-only command', async () => {
  const originalLog = console.log;
  console.log = () => {};
  try {
    assert.equal(await dispatchCommand('/skills', {}), true);
  } finally {
    console.log = originalLog;
  }
});

test('/skill is a registered alias for skills discovery', async () => {
  const originalLog = console.log;
  console.log = () => {};
  try {
    assert.equal(await dispatchCommand('/skill', {}), true);
  } finally {
    console.log = originalLog;
  }
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

test('maxloop handler sets the iteration cap and persists it', async () => {
  const config = { maxLoopIterations: 40 };
  const savedSettings = [];
  const handled = await dispatchCommand('/maxloop 80', {
    config,
    saveUserConfig: (settings) => { savedSettings.push(settings); },
  });

  assert.equal(handled, true);
  assert.equal(config.maxLoopIterations, 80);
  assert.deepEqual(savedSettings, [{ maxLoopIterations: 80 }], 'cap is persisted via saveUserConfig');

  await dispatchCommand('/maxloop nope', { config });
  assert.equal(config.maxLoopIterations, 80);
  assert.equal(savedSettings.length, 1, 'invalid input does not persist');
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

test('websearch enhanced mode is provider-independent and persists explicit state', async () => {
  const saved = [];
  const statuses = [];
  const warnings = [];
  const config = {
    provider: 'requesty',
    webSearch: false,
    webSearchMode: 'native',
    tavilyApiKey: '',
    tavilyEnabled: false,
    firecrawlApiKey: '',
    firecrawlEnabled: false,
  };

  const handled = await dispatchCommand('/websearch enhanced', {
    config,
    saveUserConfig: settings => saved.push(settings),
    printWebSearchStatus: state => statuses.push({ ...state }),
    printWebCommandWarning: message => warnings.push(message),
  });

  assert.equal(handled, true);
  assert.equal(config.webSearch, true);
  assert.equal(config.webSearchMode, 'enhanced');
  assert.deepEqual(saved, [{ webSearchMode: 'enhanced', webSearch: true }]);
  assert.equal(statuses.length, 1);
  assert.match(warnings[0], /partial capabilities/i);
});

test('native websearch remains gated to OpenRouter', async () => {
  const saved = [];
  const warnings = [];
  const config = { provider: 'requesty', webSearch: false, webSearchMode: 'enhanced' };

  await dispatchCommand('/websearch native', {
    config,
    saveUserConfig: settings => saved.push(settings),
    printWebCommandWarning: message => warnings.push(message),
  });

  assert.deepEqual(saved, []);
  assert.equal(config.webSearch, false);
  assert.match(warnings[0], /requires the OpenRouter/i);
});

test('provider root command configures a masked credential through the injected wizard', async () => {
  const saved = [];
  const configured = [];
  const config = { tavilyApiKey: '', tavilyEnabled: false };

  await dispatchCommand('/tavily', {
    config,
    promptWebProviderCredential: async provider => ({ cancelled: false, value: `${provider}-secret` }),
    saveUserConfig: settings => saved.push(settings),
    printWebProviderConfigured: provider => configured.push(provider),
  });

  assert.equal(config.tavilyEnabled, true);
  assert.equal(config.tavilyApiKey, 'tavily-secret');
  assert.deepEqual(saved, [{ tavilyApiKey: 'tavily-secret', tavilyEnabled: true }]);
  assert.deepEqual(configured, ['tavily']);
});

test('provider commands reject inline credentials without persisting or echoing them', async () => {
  const saved = [];
  const warnings = [];
  const secret = 'do-not-print-this-key';

  await dispatchCommand(`/firecrawl ${secret}`, {
    config: { firecrawlApiKey: '', firecrawlEnabled: false },
    saveUserConfig: settings => saved.push(settings),
    printWebCommandWarning: message => warnings.push(message),
  });

  assert.deepEqual(saved, []);
  assert.equal(warnings.length, 1);
  assert.doesNotMatch(warnings[0], new RegExp(secret));
  assert.match(warnings[0], /masked setup/i);
});
