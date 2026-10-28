// lifecycle-recovery.test.js — the boot scan must find the records that
// actually exist and quarantine the ones it cannot read
// (specs/2026-10-10-lifecycle-recovery-integrity, deep-dive P0-3 § 10).
//
// The scan filtered `status !== 'pending'` — a value no writer ever produces —
// so the feature that exists to surface a mid-tool crash reported 0/0 forever.
// It also counted corrupt files without ever moving them, so they came back on
// every boot.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { runStartupRecovery } from '../src/recovery.js';

const TOOL_CALL = {
  id: 'call_1',
  type: 'function',
  // A path that resolves inside the real workspace, so classify() accepts it.
  function: { name: 'readFile', arguments: JSON.stringify({ filePath: 'package.json' }) },
};

function withHistoryDir(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'emile-recovery-'));
  const historyDir = path.join(root, '.emile', 'history');
  fs.mkdirSync(historyDir, { recursive: true });
  for (const [name, contents] of Object.entries(files)) {
    const target = path.join(historyDir, name);
    if (typeof contents === 'string') fs.writeFileSync(target, contents, 'utf8');
    else fs.writeFileSync(target, JSON.stringify(contents, null, 2), 'utf8');
  }
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return historyDir;
}

const quarantinedFiles = (historyDir) => {
  const dir = path.join(historyDir, 'corrupt');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).flatMap((sessionId) =>
    fs.readdirSync(path.join(dir, sessionId)).map((f) => `${sessionId}/${f}`));
};

// ── AC-01: real vocabulary, real quarantine ─────────────────────────────────

test('a tool_pending checkpoint is classified recoverable', async (t) => {
  const historyDir = withHistoryDir(t, {
    'live.json': { id: 'live', status: 'tool_pending', pendingToolCalls: [TOOL_CALL], messages: [] },
  });

  const report = await runStartupRecovery({ sessionsDir: historyDir });

  assert.equal(report.sessionsScanned, 1);
  assert.equal(report.recoverable, 1);
  assert.equal(report.corrupt, 0);
  assert.equal(report.classified[0].sessionId, 'live');
  assert.equal(report.classified[0].classification, 'recoverable');
  assert.deepEqual(report.quarantined, [], 'a healthy checkpoint is never moved');
  assert.ok(fs.existsSync(path.join(historyDir, 'live.json')), 'the resumable record stays in place');
});

test('a malformed record is corrupt AND quarantined, leaving siblings untouched', async (t) => {
  const historyDir = withHistoryDir(t, {
    'torn.json': '{"id":"torn","status":"tool_pending","pendingToolCalls":[', // truncated JSON
    'broken.json': { id: 'broken', status: 'tool_pending', messages: [] },     // no tool calls
    'fine.json': { id: 'fine', status: 'tool_pending', pendingToolCalls: [TOOL_CALL], messages: [] },
    'done.json': { id: 'done', status: 'complete', messages: [] },
  });
  const siblingBytes = fs.readFileSync(path.join(historyDir, 'fine.json'), 'utf8');

  const report = await runStartupRecovery({ sessionsDir: historyDir });

  assert.equal(report.corrupt, 2, 'the truncated file and the tool-less checkpoint');
  assert.equal(report.recoverable, 1);
  assert.deepEqual([...report.quarantined].sort(), ['broken', 'torn']);
  assert.equal(fs.existsSync(path.join(historyDir, 'torn.json')), false, 'the torn file left the scan dir');
  assert.equal(fs.existsSync(path.join(historyDir, 'broken.json')), false);

  const moved = quarantinedFiles(historyDir).sort();
  assert.equal(moved.length, 2, `expected two quarantined files, got ${JSON.stringify(moved)}`);
  assert.ok(moved.some((f) => f.startsWith('torn/')), 'torn.json is under corrupt/torn/');
  assert.ok(moved.some((f) => f.startsWith('broken/')), 'broken.json is under corrupt/broken/');

  // Nothing else was touched: the recoverable record is byte-identical and the
  // complete one is still there.
  assert.equal(fs.readFileSync(path.join(historyDir, 'fine.json'), 'utf8'), siblingBytes);
  assert.ok(fs.existsSync(path.join(historyDir, 'done.json')));
});

// ── AC-02: complete records are ignored, not quarantined ───────────────────

test('complete records are ignored entirely', async (t) => {
  const historyDir = withHistoryDir(t, {
    'done.json': { id: 'done', status: 'complete', messages: [] },
    'legacy.json': { id: 'legacy', messages: [] }, // no status at all
  });

  const report = await runStartupRecovery({ sessionsDir: historyDir });

  assert.equal(report.sessionsScanned, 2);
  assert.equal(report.recoverable, 0);
  assert.equal(report.corrupt, 0);
  assert.deepEqual(report.classified, []);
  assert.deepEqual(report.quarantined, []);
  assert.ok(fs.existsSync(path.join(historyDir, 'done.json')), 'a finished session is not moved');
  assert.ok(fs.existsSync(path.join(historyDir, 'legacy.json')));
});

// ── AC-03: honest report shape, no throw on an empty/missing directory ─────

test('the report carries the real fields and no phantom ones', async (t) => {
  const historyDir = withHistoryDir(t, {
    'live.json': { id: 'live', status: 'tool_pending', pendingToolCalls: [TOOL_CALL], messages: [] },
  });

  const report = await runStartupRecovery({ sessionsDir: historyDir });

  assert.deepEqual(
    Object.keys(report).sort(),
    ['classified', 'corrupt', 'quarantined', 'recoverable', 'scanErrors', 'sessionsScanned'],
    'the report has exactly the fields the consumers read',
  );
  assert.equal('abandoned' in report, false, 'cli.js used to read a field that never existed');
});

test('a missing or empty history directory yields a zero report without throwing', async (t) => {
  const missing = await runStartupRecovery({ sessionsDir: path.join(os.tmpdir(), 'emile-does-not-exist-xyz') });
  assert.equal(missing.sessionsScanned, 0);
  assert.equal(missing.recoverable, 0);
  assert.equal(missing.corrupt, 0);
  assert.deepEqual(missing.quarantined, []);

  const historyDir = withHistoryDir(t, {});
  const empty = await runStartupRecovery({ sessionsDir: historyDir });
  assert.equal(empty.sessionsScanned, 0);
  assert.deepEqual(empty.classified, []);
  assert.equal(fs.existsSync(path.join(historyDir, 'corrupt')), false, 'nothing to quarantine, nothing created');
});

test('a second boot does not re-report what the first one quarantined', async (t) => {
  const historyDir = withHistoryDir(t, {
    'torn.json': 'not json {{{',
    'fine.json': { id: 'fine', status: 'tool_pending', pendingToolCalls: [TOOL_CALL], messages: [] },
  });

  const first = await runStartupRecovery({ sessionsDir: historyDir });
  assert.equal(first.corrupt, 1);

  const second = await runStartupRecovery({ sessionsDir: historyDir });
  assert.equal(second.sessionsScanned, 1, 'the quarantined file is no longer scanned');
  assert.equal(second.corrupt, 0, 'and is not reported again');
  assert.equal(second.recoverable, 1, 'the healthy checkpoint is still offered for resume');
});