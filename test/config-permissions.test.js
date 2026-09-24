import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'child_process';
import { pathToFileURL } from 'url';

const PROJECT = process.cwd();

/**
 * Runs a test script in a fresh Node.js subprocess. The script is written to a
 * temp directory whose CWD is used for config.js — so config.js reads a clean
 * temp .emile/config.json, never touching the user's real config.
 */
function runSubprocess(testScript) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `emile-test-${Date.now()}-`));
  fs.mkdirSync(path.join(tmp, '.emile'), { recursive: true });
  fs.writeFileSync(path.join(tmp, '.emile', 'config.json'),
    JSON.stringify({ provider: 'unknown', apiKey: 'unused' }));

  const scriptPath = path.join(tmp, 'test.mjs');
  const projectUrl = pathToFileURL(PROJECT).href;
  fs.writeFileSync(scriptPath, testScript({ project: projectUrl }));

  try {
    const r = execFileSync(process.execPath, [scriptPath], {
      cwd: tmp,
      env: { ...process.env, EMILE_CONFIG_DIR: path.join(tmp, 'user-config') },
    });
    return { ok: true, out: r.toString().trim() };
  } catch (err) {
    return { ok: false, out: err.stdout?.toString().trim() ?? '', err: err.message };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ── resolveApiKey ─────────────────────────────────────────────────────────

test('resolveApiKey: requesty uses REQUESTY_API_KEY', () => {
  const { out } = runSubprocess(({ project }) => [
    `process.env.REQUESTY_API_KEY = 'req-key-xyz';`,
    `const {resolveApiKey} = await import('${project}/src/config.js');`,
    `console.log(resolveApiKey('requesty'));`,
  ].join('\n'));
  assert.equal(out, 'req-key-xyz');
});

test('resolveApiKey: openrouter uses OPENROUTER_API_KEY', () => {
  const { out } = runSubprocess(({ project }) => [
    `process.env.OPENROUTER_API_KEY = 'or-key-xyz';`,
    `const {resolveApiKey} = await import('${project}/src/config.js');`,
    `console.log(resolveApiKey('openrouter'));`,
  ].join('\n'));
  assert.equal(out, 'or-key-xyz');
});

test('resolveApiKey: opencode-go uses OPENCODE_API_KEY', () => {
  const { out } = runSubprocess(({ project }) => [
    `process.env.OPENCODE_API_KEY = 'oc-key-xyz';`,
    `const {resolveApiKey} = await import('${project}/src/config.js');`,
    `console.log(resolveApiKey('opencode-go'));`,
  ].join('\n'));
  assert.equal(out, 'oc-key-xyz');
});

test('resolveApiKey: returns empty string when no matching env', () => {
  const { out } = runSubprocess(({ project }) => [
    `delete process.env.REQUESTY_API_KEY;`,
    `delete process.env.OPENROUTER_API_KEY;`,
    `delete process.env.OPENCODE_API_KEY;`,
    `const {resolveApiKey} = await import('${project}/src/config.js');`,
    `console.log(resolveApiKey('requesty'));`,
  ].join('\n'));
  assert.equal(out, '');
});

// ── Config file mode 0600 ─────────────────────────────────────────────────

test('saveUserConfig writes user config with mode 0600', { skip: process.platform === 'win32' }, () => {
  const { out } = runSubprocess(({ project }) => [
    `import fs from 'node:fs';`,
    `const {saveUserConfig} = await import('${project}/src/config.js');`,
    `saveUserConfig({ apiKey: 'test' });`,
    `const mode = fs.statSync('user-config/config.json').mode & 0o777;`,
    `console.log(mode);`,
  ].join('\n'));
  const mode = parseInt(out, 10);
  assert.equal(mode, 0o600, `user config mode should be 0600, got ${mode?.toString(8)}`);
});

test('saveUserConfig chmods existing user config to 0600', { skip: process.platform === 'win32' }, () => {
  const { out } = runSubprocess(({ project }) => [
    `import fs from 'node:fs';`,
    `fs.mkdirSync('user-config', { recursive: true });`,
    `fs.writeFileSync('user-config/config.json', '{}', { mode: 0o644 });`,
    `const {saveUserConfig} = await import('${project}/src/config.js');`,
    `saveUserConfig({ apiKey: 'test' });`,
    `const mode = fs.statSync('user-config/config.json').mode & 0o777;`,
    `console.log(mode);`,
  ].join('\n'));
  const mode = parseInt(out, 10);
  assert.equal(mode, 0o600, `user config should be 0600 after chmod, got ${mode?.toString(8)}`);
});
