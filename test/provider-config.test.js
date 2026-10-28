// Contract suite for the config v2 multi-provider system.
//
// Every stateful case runs in a real Node.js subprocess with a fake HOME so
// that the module-level config load/save side effects in src/config.js happen
// against an isolated ~/.emile/config.json (no mocking, no chmod assertions).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const PROJECT = process.cwd();
// ESM dynamic imports need a file:// URL; a bare Windows path (C:\...) is
// rejected with ERR_UNSUPPORTED_ESM_URL_SCHEME.
const PROJECT_URL = pathToFileURL(PROJECT).href;

// Env vars that would leak a real gateway key/override into a child process.
const ENV_SCRUB = [
  'delete process.env.REQUESTY_API_KEY;',
  'delete process.env.OPENROUTER_API_KEY;',
  'delete process.env.OPENCODE_API_KEY;',
  'delete process.env.EMILE_PROVIDER;',
  'delete process.env.EMILE_DEFAULT_MODEL;',
].join('\n');

// Preamble: fail the child loudly (non-zero exit + stderr) on any assert throw.
// Any failed in-child assertion must surface on stderr AND fail the exit code
// so the parent can assert on { ok: true }.
const GUARD = `
process.on('uncaughtException', fail);
process.on('unhandledRejection', fail);
function fail(e) { console.error(e && e.stack || String(e)); process.exit(1); }
`;

/**
 * Runs a test script in a fresh Node.js subprocess against a fake HOME.
 *
 * @param {object|string|null} initialConfig  contents of ~/.emile/config.json;
 *   an object is serialised, a string is written verbatim, null writes no file.
 * @param {(ctx: {project: string, fakeHome: string}) => string[]} testScript
 */
async function runWithConfig(initialConfig, testScript) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `emile-prov-${Date.now()}-`));
  const fakeHome = path.join(tmp, 'home');
  fs.mkdirSync(path.join(fakeHome, '.emile'), { recursive: true });
  if (typeof initialConfig === 'string') {
    fs.writeFileSync(path.join(fakeHome, '.emile', 'config.json'), initialConfig);
  } else if (initialConfig && typeof initialConfig === 'object') {
    fs.writeFileSync(
      path.join(fakeHome, '.emile', 'config.json'),
      JSON.stringify(initialConfig, null, 2),
    );
  }

  const scriptPath = path.join(tmp, 'test.mjs');
  const stdoutPath = path.join(tmp, 'stdout.txt');
  const stderrPath = path.join(tmp, 'stderr.txt');
  fs.writeFileSync(scriptPath, [GUARD, ...testScript({ project: PROJECT_URL, fakeHome })].join('\n'));

  try {
    return await new Promise(resolve => {
      const stdoutFd = fs.openSync(stdoutPath, 'w');
      const stderrFd = fs.openSync(stderrPath, 'w');
      const child = spawn(process.execPath, [scriptPath], {
        cwd: tmp,
        env: {
          ...process.env,
          HOME: fakeHome,
          // os.homedir() on Windows reads USERPROFILE, not HOME.
          USERPROFILE: fakeHome,
        },
        stdio: ['ignore', stdoutFd, stderrFd],
      });
      fs.closeSync(stdoutFd);
      fs.closeSync(stderrFd);
      let spawnError = null;
      child.once('error', error => { spawnError = error; });
      child.once('close', code => {
        const stdout = fs.readFileSync(stdoutPath, 'utf8').trim();
        const stderr = fs.readFileSync(stderrPath, 'utf8').trim();
        if (spawnError) resolve({ ok: false, out: stdout, err: spawnError.message });
        else resolve(code === 0
          ? { ok: true, out: stdout }
          : { ok: false, out: stdout, err: `Node exited ${code}\n${stderr}` });
      });
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ── T1: legacy v1 migration in memory, v2 shape on disk ──────────────────────

test('T1 legacy v1 config migrates in memory and is rewritten as v2', async () => {
  const initial = {
    provider: 'openrouter',
    apiKey: 'or-key-123456',
    model: 'anthropic/claude-3-5-sonnet',
    effort: 'medium',
  };
  const { ok, out, err } = await runWithConfig(initial, ({ project }) => [
    ENV_SCRUB,
    `import a from 'node:assert/strict';`,
    `import fs from 'node:fs';`,
    `import os from 'node:os';`,
    `const { config, hasCredentials, saveUserConfig } = await import('${project}/src/config.js');`,
    `a.equal(config.provider, 'openrouter');`,
    `a.equal(config.apiKey, 'or-key-123456');`,
    `a.equal(config.defaultModel, 'anthropic/claude-3-5-sonnet');`,
    `a.equal(hasCredentials(), true);`,
    `saveUserConfig({ effort: 'low' });`,
    `const file = JSON.parse(fs.readFileSync(os.homedir() + '/.emile/config.json', 'utf8'));`,
    `a.equal(file.version, 2);`,
    `a.equal(file.activeProvider, 'openrouter');`,
    `a.equal(file.providers.openrouter.apiKey, 'or-key-123456');`,
    `a.equal(file.providers.openrouter.lastModel, 'anthropic/claude-3-5-sonnet');`,
    `a.equal(file.effort, 'low');`,
    `a.equal('provider' in file, false);`,
    `a.equal('apiKey' in file, false);`,
    `a.equal('model' in file, false);`,
    `console.log('OK');`,
  ]);
  assert.equal(ok, true, err);
  assert.equal(out, 'OK', err);
});

// ── T2: configuring provider B leaves provider A intact ──────────────────────

test('T2 configuring a second provider does not erase the first', async () => {
  const initial = {
    version: 2,
    activeProvider: 'openrouter',
    providers: {
      openrouter: { apiKey: 'or-key-123456', lastModel: 'anthropic/claude-3-5-sonnet' },
    },
    effort: 'low',
    webSearch: false,
    maxLoopIterations: 90,
  };
  const { ok, out, err } = await runWithConfig(initial, ({ project }) => [
    ENV_SCRUB,
    `import a from 'node:assert/strict';`,
    `import fs from 'node:fs';`,
    `import os from 'node:os';`,
    `const { saveUserConfig } = await import('${project}/src/config.js');`,
    `saveUserConfig({ provider: 'requesty', apiKey: 'rq-key-678901', model: 'deepseek/deepseek-chat' });`,
    `const file = JSON.parse(fs.readFileSync(os.homedir() + '/.emile/config.json', 'utf8'));`,
    `a.equal(file.providers.openrouter.apiKey, 'or-key-123456');`,
    `a.equal(file.providers.requesty.apiKey, 'rq-key-678901');`,
    `a.equal(file.activeProvider, 'requesty');`,
    `a.equal(file.providers.requesty.lastModel, 'deepseek/deepseek-chat');`,
    `console.log('OK');`,
  ]);
  assert.equal(ok, true, err);
  assert.equal(out, 'OK', err);
});

// ── T3: key isolation and masked slot views ──────────────────────────────────

test('T3 API keys are isolated per slot and masked in slot views', async () => {
  const initial = {
    version: 2,
    activeProvider: 'openrouter',
    providers: {
      openrouter: { apiKey: 'or-key-123456', lastModel: 'anthropic/claude-3-5-sonnet' },
      'lm-studio': {
        apiKey: 'lm-key-abcdef',
        baseURL: 'http://localhost:1234/v1',
        format: 'chat-completions',
      },
    },
    effort: 'low',
    webSearch: false,
    maxLoopIterations: 90,
  };
  const { ok, out, err } = await runWithConfig(initial, ({ project }) => [
    ENV_SCRUB,
    `import a from 'node:assert/strict';`,
    `const { resolveApiKey, getProviderSlots } = await import('${project}/src/config.js');`,
    `a.equal(resolveApiKey('requesty'), '');`,
    `a.equal(resolveApiKey('openrouter'), 'or-key-123456');`,
    `a.equal(resolveApiKey('lm-studio'), 'lm-key-abcdef');`,
    `const slots = getProviderSlots();`,
    `const dumped = JSON.stringify(slots);`,
    `a.ok(dumped.includes('cdef'));`,
    `a.ok(!dumped.includes('lm-key-abcdef'));`,
    `a.ok(!dumped.includes('or-key-123456'));`,
    `const lm = slots.find(s => s.id === 'lm-studio');`,
    `a.equal(lm.hasKey, true);`,
    `a.equal(lm.isCustom, true);`,
    `a.equal(lm.format, 'chat-completions');`,
    `console.log('OK');`,
  ]);
  assert.equal(ok, true, err);
  assert.equal(out, 'OK', err);
});

// ── T4: /provider on a keyless gateway never switches ───────────────────────

test('T4 /provider on a keyless gateway prints guidance and does not switch', async () => {
  const initial = {
    version: 2,
    activeProvider: 'openrouter',
    providers: {
      openrouter: { apiKey: 'or-key-123456', lastModel: 'anthropic/claude-3-5-sonnet' },
      requesty: { apiKey: '' },
    },
    effort: 'low',
    webSearch: false,
    maxLoopIterations: 90,
  };
  const { ok, out, err } = await runWithConfig(initial, ({ project }) => [
    ENV_SCRUB,
    `const { handleProvider } = await import('${project}/src/commands/handlers.js');`,
    `const { config } = await import('${project}/src/config.js');`,
    `await handleProvider({`,
    `  config,`,
    `  options: { cache: false },`,
    `  activeSkills: [],`,
    `  getMessages: () => [],`,
    `  initSessionStats() {},`,
    `  selectProvider: async () => 'requesty',`,
    `});`,
    `console.log('CHECKPOINT:' + (config.provider === 'openrouter' ? 'NO_SWITCH' : 'SWITCHED'));`,
  ]);
  assert.equal(ok, true, err);
  assert.ok(out.includes('/connect'), `expected /connect guidance in output:\n${out}`);
  assert.ok(out.includes('No key configured'), `expected keyless message in output:\n${out}`);
  assert.ok(out.includes('NO_SWITCH'), `expected NO_SWITCH marker in output:\n${out}`);
  assert.ok(!out.includes('Enter API Key'), `must not prompt for a password:\n${out}`);
});

// ── T5: setActiveProvider restores lastModel and re-syncs context limit ─────

test('T5 setActiveProvider restores lastModel and re-syncs the context limit', async () => {
  const initial = {
    version: 2,
    activeProvider: 'openrouter',
    providers: {
      openrouter: { apiKey: 'or-key-123456', lastModel: 'anthropic/claude-3-5-sonnet' },
      'lm-studio': {
        apiKey: '',
        baseURL: 'http://localhost:1234/v1',
        format: 'chat-completions',
        lastModel: 'qwen2.5-coder-32b',
      },
    },
    effort: 'low',
    webSearch: false,
    maxLoopIterations: 90,
  };
  const { ok, out, err } = await runWithConfig(initial, ({ project }) => [
    ENV_SCRUB,
    `import a from 'node:assert/strict';`,
    `const { config, setActiveProvider } = await import('${project}/src/config.js');`,
    `const { sessionStats, initSessionStats, getContextLimit } = await import('${project}/src/agent/session-stats.js');`,
    `const before = getContextLimit(config.defaultModel);`,
    `a.equal(before, 200000);`,
    `a.equal(setActiveProvider('lm-studio'), true);`,
    `a.equal(config.defaultModel, 'qwen2.5-coder-32b');`,
    `initSessionStats(config.defaultModel, false, [], []);`,
    `a.equal(sessionStats.contextLimit, 131072);`,
    `a.notEqual(sessionStats.contextLimit, before);`,
    `a.equal(setActiveProvider('bogus-id'), false);`,
    `a.equal(config.provider, 'lm-studio');`,
    `console.log('OK');`,
  ]);
  assert.equal(ok, true, err);
  assert.equal(out, 'OK', err);
});

// ── T6: removeProvider falls back to a surviving slot ───────────────────────

test('T6 removeProvider drops the slot and falls back to the survivor', async () => {
  const initial = {
    version: 2,
    activeProvider: 'openrouter',
    providers: {
      openrouter: { apiKey: 'or-key-123456', lastModel: 'anthropic/claude-3-5-sonnet' },
      'lm-studio': {
        apiKey: '',
        baseURL: 'http://localhost:1234/v1',
        format: 'chat-completions',
      },
    },
    effort: 'low',
    webSearch: false,
    maxLoopIterations: 90,
  };
  const { ok, out, err } = await runWithConfig(initial, ({ project }) => [
    ENV_SCRUB,
    `import a from 'node:assert/strict';`,
    `import fs from 'node:fs';`,
    `import os from 'node:os';`,
    `const { config, removeProvider, resolveApiKey } = await import('${project}/src/config.js');`,
    `a.equal(removeProvider('openrouter'), true);`,
    `const file = JSON.parse(fs.readFileSync(os.homedir() + '/.emile/config.json', 'utf8'));`,
    `a.equal('openrouter' in file.providers, false);`,
    `a.equal(file.activeProvider, 'lm-studio');`,
    `a.equal(config.provider, 'lm-studio');`,
    `a.equal(resolveApiKey('lm-studio'), '');`,
    `console.log('OK');`,
  ]);
  assert.equal(ok, true, err);
  assert.equal(out, 'OK', err);
});

// ── T7: endpoint validation and custom-id classification ─────────────────────

test('T7 isValidProviderURL and isCustomProvider matrices', async () => {
  const { ok, out, err } = await runWithConfig(null, ({ project }) => [
    ENV_SCRUB,
    `import a from 'node:assert/strict';`,
    `const { isValidProviderURL, isCustomProvider } = await import('${project}/src/config.js');`,
    `a.equal(isValidProviderURL('https://api.example.com/v1'), true);`,
    `a.equal(isValidProviderURL('http://localhost:1234/v1'), true);`,
    `a.equal(isValidProviderURL('http://127.0.0.1:8000'), true);`,
    `a.equal(isValidProviderURL('http://evil.example.com/v1'), false);`,
    `a.equal(isValidProviderURL('localhost:1234'), false);`,
    `a.equal(isValidProviderURL('not a url'), false);`,
    `a.equal(isValidProviderURL('file:///C:/secrets'), false);`,
    `a.equal(isValidProviderURL('ws://localhost:9'), false);`,
    `a.equal(isValidProviderURL(''), false);`,
    `a.equal(isCustomProvider('lm-studio'), true);`,
    `a.equal(isCustomProvider('openrouter'), false);`,
    `a.equal(isCustomProvider(''), false);`,
    `a.equal(isCustomProvider(null), false);`,
    `console.log('OK');`,
  ]);
  assert.equal(ok, true, err);
  assert.equal(out, 'OK', err);
});

// ── T8: hand-edited garbage fails soft ───────────────────────────────────────

test('T8 malformed hand-edited config is parsed defensively', async () => {
  const garbage = {
    version: 2,
    activeProvider: 'ghost',
    providers: {
      'bad-custom': { apiKey: 'x' },
      'ok-custom': { baseURL: 'https://api.ok.com/v1', apiKey: 'y' },
      broken: 'not-an-object',
    },
    effort: 'low',
    webSearch: false,
    maxLoopIterations: 90,
  };

  const first = await runWithConfig(garbage, ({ project }) => [
    ENV_SCRUB,
    `import a from 'node:assert/strict';`,
    `const { config, getProviderSlots, hasCredentials, validateConfig } = await import('${project}/src/config.js');`,
    `a.deepEqual(getProviderSlots().map(s => s.id), ['ok-custom']);`,
    `a.equal(config.provider, 'requesty');`,
    `a.equal(hasCredentials(), false);`,
    `a.equal(validateConfig(), false);`,
    `console.log('OK');`,
  ]);
  assert.equal(first.ok, true, first.err);
  assert.equal(first.out, 'OK', first.err);

  const second = await runWithConfig({ provider: 'unknown', apiKey: 'unused' }, ({ project }) => [
    ENV_SCRUB,
    `import a from 'node:assert/strict';`,
    `const { config } = await import('${project}/src/config.js');`,
    `a.equal(config.provider, 'requesty');`,
    `a.equal(config.apiKey, '');`,
    `console.log('OK');`,
  ]);
  assert.equal(second.ok, true, second.err);
  assert.equal(second.out, 'OK', second.err);
});

// ── T9: client fails closed on a smuggled remote http endpoint ───────────────

test('T9 getClient refuses a hand-edited remote http endpoint', async () => {
  const initial = {
    version: 2,
    activeProvider: 'evil',
    providers: {
      evil: { apiKey: 'x', baseURL: 'http://evil.example.com/v1', format: 'chat-completions' },
    },
    effort: 'low',
    webSearch: false,
    maxLoopIterations: 90,
  };
  const { ok, out, err } = await runWithConfig(initial, ({ project }) => [
    ENV_SCRUB,
    `import a from 'node:assert/strict';`,
    `const { getClient } = await import('${project}/src/api/client.js');`,
    `let thrown = null;`,
    `try { getClient(); } catch (e) { thrown = e; }`,
    `a.ok(thrown, 'getClient should have thrown');`,
    `const message = String(thrown.message);`,
    `a.ok(message.includes('invalid endpoint URL'), 'message: ' + message);`,
    `a.ok(message.includes('Run /connect'), 'message: ' + message);`,
    `a.ok(!message.includes('evil.example.com/v1'), 'message: ' + message);`,
    `console.log('OK');`,
  ]);
  assert.equal(ok, true, err);
  assert.equal(out, 'OK', err);
});
