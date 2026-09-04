import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const PROJECT = process.cwd();

/**
 * Runs a test script in a fresh Node.js subprocess. The script is written to a
 * temp directory. Since config now lives in ~/.emile/ (global), we create
 * a fake HOME directory with a .emile/config.json for each test.
 */
async function runSubprocess(testScript) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `emile-test-${Date.now()}-`));
  const fakeHome = path.join(tmp, 'home');
  fs.mkdirSync(path.join(fakeHome, '.emile'), { recursive: true });
  // Create a dummy global config that won't interfere with tests
  fs.writeFileSync(path.join(fakeHome, '.emile', 'config.json'),
    JSON.stringify({ provider: 'unknown', apiKey: 'unused' }));

  const scriptPath = path.join(tmp, 'test.mjs');
  const stdoutPath = path.join(tmp, 'stdout.txt');
  const stderrPath = path.join(tmp, 'stderr.txt');
  fs.writeFileSync(scriptPath, testScript({ project: PROJECT, fakeHome }));

  try {
    return await new Promise(resolve => {
      const stdoutFd = fs.openSync(stdoutPath, 'w');
      const stderrFd = fs.openSync(stderrPath, 'w');
      const child = spawn(process.execPath, [scriptPath], {
        cwd: tmp,
        env: { ...process.env, HOME: fakeHome },
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

// ── resolveApiKey ─────────────────────────────────────────────────────────

test('resolveApiKey: requesty uses REQUESTY_API_KEY', async () => {
  const { ok, out, err } = await runSubprocess(({ project }) => [
    `process.env.REQUESTY_API_KEY = 'req-key-xyz';`,
    `const {resolveApiKey} = await import('${project}/src/config.js');`,
    `console.log(resolveApiKey('requesty'));`,
  ].join('\n'));
  assert.equal(ok, true, err);
  assert.equal(out, 'req-key-xyz', err);
});

test('resolveApiKey: openrouter uses OPENROUTER_API_KEY', async () => {
  const { out, err } = await runSubprocess(({ project }) => [
    `process.env.OPENROUTER_API_KEY = 'or-key-xyz';`,
    `const {resolveApiKey} = await import('${project}/src/config.js');`,
    `console.log(resolveApiKey('openrouter'));`,
  ].join('\n'));
  assert.equal(out, 'or-key-xyz', err);
});

test('resolveApiKey: opencode-go uses OPENCODE_API_KEY', async () => {
  const { out, err } = await runSubprocess(({ project }) => [
    `process.env.OPENCODE_API_KEY = 'oc-key-xyz';`,
    `const {resolveApiKey} = await import('${project}/src/config.js');`,
    `console.log(resolveApiKey('opencode-go'));`,
  ].join('\n'));
  assert.equal(out, 'oc-key-xyz', err);
});

test('resolveApiKey: returns empty string when no matching env', async () => {
  const { out } = await runSubprocess(({ project }) => [
    `delete process.env.REQUESTY_API_KEY;`,
    `delete process.env.OPENROUTER_API_KEY;`,
    `delete process.env.OPENCODE_API_KEY;`,
    `const {resolveApiKey} = await import('${project}/src/config.js');`,
    `console.log(resolveApiKey('requesty'));`,
  ].join('\n'));
  assert.equal(out, '');
});

// ── Config file mode 0600 ─────────────────────────────────────────────────

test('saveUserConfig writes config.json with mode 0600', async () => {
  const { out, err } = await runSubprocess(({ project, fakeHome }) => [
    `import fs from 'node:fs';`,
    `import os from 'node:os';`,
    `const {saveUserConfig} = await import('${project}/src/config.js');`,
    `saveUserConfig({ apiKey: 'test' });`,
    `const configPath = os.homedir() + '/.emile/config.json';`,
    `const mode = fs.statSync(configPath).mode & 0o777;`,
    `console.log(mode);`,
  ].join('\n'));
  const mode = parseInt(out, 10);
  assert.equal(mode, 0o600, err || `config file mode should be 0600, got ${mode?.toString(8)}`);
});

test('saveUserConfig chmods existing 0644 config to 0600', async () => {
  const { out, err } = await runSubprocess(({ project, fakeHome }) => [
    `import fs from 'node:fs';`,
    `import os from 'node:os';`,
    `const configPath = os.homedir() + '/.emile/config.json';`,
    `fs.writeFileSync(configPath, '{}', { mode: 0o644 });`,
    `const {saveUserConfig} = await import('${project}/src/config.js');`,
    `saveUserConfig({ apiKey: 'test' });`,
    `const mode = fs.statSync(configPath).mode & 0o777;`,
    `console.log(mode);`,
  ].join('\n'));
  const mode = parseInt(out, 10);
  assert.equal(mode, 0o600, err || `config should be 0600 after chmod, got ${mode?.toString(8)}`);
});
