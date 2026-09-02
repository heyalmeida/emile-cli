import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

async function withTmpDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `emile-recovery-${Date.now()}-`));
  try {
    return await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// We cannot monkey-patch ES modules directly. Instead we test recovery with
// paths that are guaranteed to exist in the actual workspace (config.workspaceDir).
// The security check itself is tested in security.test.js.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WS_ROOT = path.resolve(__dirname, '..');

// Now import recovery — it will use the patched resolveSafePath.
async function runRecovery(sessionsDir) {
  const { runStartupRecovery } = await import('../src/recovery.js');
  return runStartupRecovery({ sessionsDir });
}

// ── Happy path ───────────────────────────────────────────────────────────────

test('returns empty report when history dir does not exist', async () => {
  const report = await runRecovery('/nonexistent/history');
  assert.equal(report.sessionsScanned, 0);
  assert.equal(report.recoverable, 0);
  assert.equal(report.corrupt, 0);
});

test('skips complete sessions', async () => {
  await withTmpDir(async (dir) => {
    const historyDir = path.join(dir, '.emile', 'history');
    fs.mkdirSync(historyDir, { recursive: true });
    fs.writeFileSync(path.join(historyDir, 'complete.json'), JSON.stringify({
      id: 'complete', status: 'complete', messages: [], summary: 'done',
    }));
    const report = await runRecovery(historyDir);
    assert.equal(report.sessionsScanned, 1);
    assert.equal(report.recoverable, 0);
    assert.equal(report.corrupt, 0);
  });
});

// ── Recoverable ─────────────────────────────────────────────────────────────

test('classifies a valid pending session as recoverable', async () => {
  await withTmpDir(async (dir) => {
    const historyDir = path.join(dir, '.emile', 'history');
    fs.mkdirSync(historyDir, { recursive: true });
    // Use a path that exists in the actual workspace since we cannot mock resolveSafePath
    fs.writeFileSync(path.join(historyDir, 'pending_ok.json'), JSON.stringify({
      id: 'pending_ok',
      status: 'pending',
      pendingToolCalls: [{
        id: 'call_1', type: 'function',
        function: { name: 'readFile', arguments: JSON.stringify({ filePath: 'package.json' }) },
      }],
      messages: [],
    }));
    const report = await runRecovery(historyDir);
    assert.equal(report.recoverable, 1);
    assert.equal(report.classified[0].classification, 'recoverable');
  });
});

// ── Corrupt ────────────────────────────────────────────────────────────────

test('classifies malformed JSON as corrupt', async () => {
  await withTmpDir(async (dir) => {
    const historyDir = path.join(dir, '.emile', 'history');
    fs.mkdirSync(historyDir, { recursive: true });
    fs.writeFileSync(path.join(historyDir, 'bad.json'), 'not valid json {{{');
    const report = await runRecovery(historyDir);
    assert.equal(report.corrupt, 1);
    assert.equal(report.scanErrors.length, 1);
    assert.equal(report.classified[0].classification, 'corrupt');
  });
});

test('classifies pending without tool calls as corrupt', async () => {
  await withTmpDir(async (dir) => {
    const historyDir = path.join(dir, '.emile', 'history');
    fs.mkdirSync(historyDir, { recursive: true });
    fs.writeFileSync(path.join(historyDir, 'no_tools.json'), JSON.stringify({
      id: 'no_tools', status: 'pending', messages: [],
    }));
    const report = await runRecovery(historyDir);
    assert.equal(report.corrupt, 1);
    assert.equal(report.classified[0].reason, 'pending session has no tool calls');
  });
});

test('classifies tool call missing function.name as corrupt', async () => {
  await withTmpDir(async (dir) => {
    const historyDir = path.join(dir, '.emile', 'history');
    fs.mkdirSync(historyDir, { recursive: true });
    fs.writeFileSync(path.join(historyDir, 'bad.json'), JSON.stringify({
      id: 'bad', status: 'pending',
      pendingToolCalls: [{ id: 'c1', type: 'function', function: {} }],
      messages: [],
    }));
    const report = await runRecovery(historyDir);
    assert.equal(report.corrupt, 1);
    assert.ok(report.classified[0].reason.includes('function.name'));
  });
});

test('classifies tool call with invalid JSON args as corrupt', async () => {
  await withTmpDir(async (dir) => {
    const historyDir = path.join(dir, '.emile', 'history');
    fs.mkdirSync(historyDir, { recursive: true });
    fs.writeFileSync(path.join(historyDir, 'bad_args.json'), JSON.stringify({
      id: 'bad_args', status: 'pending',
      pendingToolCalls: [{
        id: 'c1', type: 'function',
        function: { name: 'readFile', arguments: 'not json' },
      }],
      messages: [],
    }));
    const report = await runRecovery(historyDir);
    assert.equal(report.corrupt, 1);
    assert.ok(report.classified[0].reason.includes('invalid JSON'));
  });
});

test('classifies unreadable session file as corrupt', async () => {
  await withTmpDir(async (dir) => {
    const historyDir = path.join(dir, '.emile', 'history');
    fs.mkdirSync(historyDir, { recursive: true });
    fs.mkdirSync(path.join(historyDir, 'unreadable.json')); // directory with same name
    const report = await runRecovery(historyDir);
    assert.equal(report.corrupt, 1);
    assert.equal(report.scanErrors.length, 1);
  });
});

// ── Multi-session ───────────────────────────────────────────────────────────

test('multiple sessions are each classified independently', async () => {
  await withTmpDir(async (dir) => {
    const historyDir = path.join(dir, '.emile', 'history');
    fs.mkdirSync(historyDir, { recursive: true });
    // Use package.json which exists in the actual workspace
    fs.writeFileSync(path.join(historyDir, 's1.json'), JSON.stringify({
      id: 's1', status: 'pending',
      pendingToolCalls: [{ id: 'c1', type: 'function', function: { name: 'readFile', arguments: JSON.stringify({ filePath: 'package.json' }) } }],
      messages: [],
    }));
    fs.writeFileSync(path.join(historyDir, 's2.json'), JSON.stringify({
      id: 's2', status: 'pending', messages: [],
    }));
    fs.writeFileSync(path.join(historyDir, 's3.json'), JSON.stringify({
      id: 's3', status: 'complete', messages: [],
    }));
    const report = await runRecovery(historyDir);
    assert.equal(report.sessionsScanned, 3);
    assert.equal(report.recoverable, 1);
    assert.equal(report.corrupt, 1);
    assert.equal(report.classified.length, 2);
  });
});
