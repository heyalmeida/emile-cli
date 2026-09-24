// secure-config.test.js — verifies user-scoped settings and protected provider
// credentials without printing any secret value.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const PROJECT = process.cwd();
const PROJECT_URL = pathToFileURL(PROJECT).href;
const SECRET = 'test-secret-never-print';

function runIsolated(script) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `emile-secure-config-${Date.now()}-`));
  const configDir = path.join(tmp, 'user-config');
  fs.mkdirSync(path.join(tmp, '.emile'), { recursive: true });
  const scriptPath = path.join(tmp, 'test.mjs');
  fs.writeFileSync(scriptPath, Array.isArray(script) ? script.join('\n') : script);
  try {
    const stdout = execFileSync(process.execPath, [scriptPath], {
      cwd: tmp,
      env: { ...process.env, EMILE_CONFIG_DIR: configDir },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { tmp, configDir, stdout: stdout.trim() };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function runJson(lines) {
  return runIsolated(lines.join('\n'));
}

test('saves settings without serializing the API key', () => {
  const result = runJson([
    `import fs from 'node:fs';`,
    `const { saveUserConfig } = await import('${PROJECT_URL}/src/config.js');`,
    `saveUserConfig({ provider: 'openrouter', apiKey: '${SECRET}', model: 'test/model', effort: 'high' });`,
    `const settings = fs.readFileSync('user-config/config.json', 'utf8');`,
    `const credentials = fs.readFileSync('user-config/credentials.json', 'utf8');`,
    `console.log(JSON.stringify({ settingsHasKey: settings.includes('apiKey') || settings.includes('${SECRET}'), credentialsHaveSecret: credentials.includes('${SECRET}') }));`,
  ]);
  assert.deepEqual(JSON.parse(result.stdout), { settingsHasKey: false, credentialsHaveSecret: false });
});

test('reuses one isolated directory across different workspaces', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `emile-secure-config-${Date.now()}-`));
  const configDir = path.join(tmp, 'user-config');
  const workspaceA = path.join(tmp, 'workspace-a');
  const workspaceB = path.join(tmp, 'workspace-b');
  fs.mkdirSync(workspaceA);
  fs.mkdirSync(workspaceB);
  const run = (lines, cwd) => {
    const scriptPath = path.join(tmp, 'test.mjs');
    fs.writeFileSync(scriptPath, lines.join('\n'));
    return execFileSync(process.execPath, [scriptPath], {
      cwd,
      env: { ...process.env, EMILE_CONFIG_DIR: configDir },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  };
  try {
    run([
      `const { saveUserConfig } = await import('${PROJECT_URL}/src/config.js');`,
      `saveUserConfig({ provider: 'openrouter', apiKey: '${SECRET}', model: 'test/model' });`,
    ], workspaceA);
    const output = run([
      `const { config, resolveApiKey } = await import('${PROJECT_URL}/src/config.js');`,
      `console.log(JSON.stringify({ provider: config.provider, model: config.defaultModel, keyLoaded: resolveApiKey('openrouter') === '${SECRET}', wrongProvider: resolveApiKey('requesty') === '${SECRET}' }));`,
    ], workspaceB);
    assert.deepEqual(JSON.parse(output), {
      provider: 'openrouter',
      model: 'test/model',
      keyLoaded: true,
      wrongProvider: false,
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('migrates a legacy workspace key and removes it only after protected storage succeeds', () => {
  const result = runIsolated([
    `import fs from 'node:fs';`,
    `fs.writeFileSync('.emile/config.json', JSON.stringify({ provider: 'openrouter', apiKey: '${SECRET}', model: 'legacy/model' }));`,
    `const { config } = await import('${PROJECT_URL}/src/config.js');`,
    `const legacy = fs.readFileSync('.emile/config.json', 'utf8');`,
    `const global = fs.readFileSync('user-config/config.json', 'utf8');`,
    `console.log(JSON.stringify({ loaded: config.apiKey === '${SECRET}', legacyHasKey: legacy.includes('${SECRET}'), globalHasKey: global.includes('${SECRET}') || global.includes('apiKey') }));`,
  ]);
  assert.deepEqual(JSON.parse(result.stdout), {
    loaded: true,
    legacyHasKey: false,
    globalHasKey: false,
  });
});

test('corrupt protected storage fails closed without using another provider key', () => {
  const result = runIsolated([
    `import fs from 'node:fs';`,
    `fs.mkdirSync('user-config', { recursive: true });`,
    `fs.writeFileSync('user-config/credentials.json', '{not-json');`,
    `const { resolveApiKey } = await import('${PROJECT_URL}/src/config.js');`,
    `console.log(JSON.stringify({ requesty: resolveApiKey('requesty') === '${SECRET}', openrouter: resolveApiKey('openrouter') === '${SECRET}' }));`,
  ]);
  assert.deepEqual(JSON.parse(result.stdout), { requesty: false, openrouter: false });
});
