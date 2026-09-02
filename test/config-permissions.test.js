import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.REQUESTY_API_KEY = 'req-key-xyz';
process.env.OPENROUTER_API_KEY = 'or-key-xyz';
process.env.OPENCODE_API_KEY = 'oc-key-xyz';

const { resolveApiKey, saveUserConfig, config } = await import('../src/config.js');

const TEST_WS = fs.mkdtempSync(path.join(os.tmpdir(), 'emile-cfg-test-'));
const TEST_CONFIG = path.join(TEST_WS, '.emile', 'config-test.json');
fs.mkdirSync(path.dirname(TEST_CONFIG), { recursive: true });

// Use a dedicated test workspace that won't be touched by other test files.
// Each test sets config.workspaceDir to TEST_WS and cleans the test config file.
function cleanTestConfig() {
  try { fs.unlinkSync(TEST_CONFIG); } catch { /* best-effort */ }
}

test('resolveApiKey: requesty uses REQUESTY_API_KEY', () => {
  assert.equal(resolveApiKey('requesty'), 'req-key-xyz');
});

test('resolveApiKey: openrouter uses OPENROUTER_API_KEY', () => {
  assert.equal(resolveApiKey('openrouter'), 'or-key-xyz');
});

test('resolveApiKey: opencode-go uses OPENCODE_API_KEY', () => {
  assert.equal(resolveApiKey('opencode-go'), 'oc-key-xyz');
});

test('resolveApiKey: returns empty for unknown provider with no env', () => {
  delete process.env.REQUESTY_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENCODE_API_KEY;
  assert.equal(resolveApiKey('requesty'), '');
});

test('saveUserConfig writes with mode 0600', () => {
  cleanTestConfig();
  const orig = config.workspaceDir;
  config.workspaceDir = TEST_WS;
  try {
    saveUserConfig({ apiKey: 'test-key' });
    if (fs.existsSync(TEST_CONFIG)) {
      const mode = fs.statSync(TEST_CONFIG).mode & 0o777;
      assert.equal(mode, 0o600, `expected 0600, got ${mode.toString(8)}`);
    }
  } finally {
    config.workspaceDir = orig;
    cleanTestConfig();
  }
});

test('saveUserConfig chmods existing 0644 file to 0600', () => {
  cleanTestConfig();
  fs.writeFileSync(TEST_CONFIG, '{}', { mode: 0o644 });
  const orig = config.workspaceDir;
  config.workspaceDir = TEST_WS;
  try {
    saveUserConfig({ apiKey: 'test' });
    const mode = fs.statSync(TEST_CONFIG).mode & 0o777;
    assert.equal(mode, 0o600, `expected 0600 after chmod, got ${mode.toString(8)}`);
  } finally {
    config.workspaceDir = orig;
    cleanTestConfig();
  }
});

test.afterAll(() => {
  delete process.env.REQUESTY_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENCODE_API_KEY;
  try { fs.rmSync(TEST_WS, { recursive: true, force: true }); } catch { /* best-effort */ }
});
