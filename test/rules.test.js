import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { config } from '../src/config.js';
import { buildSystemPrompt } from '../src/prompt.js';
import { MAX_RULES_CHARS, findRulesFile, formatRulesBlock, loadRules } from '../src/rules.js';
import { stripTerminalControls } from '../src/ui/control.js';

const originalWorkspace = config.workspaceDir;

function withWorkspace(fn) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'emile-rules-workspace-'));
  config.workspaceDir = workspace;
  try {
    return fn(workspace);
  } finally {
    config.workspaceDir = originalWorkspace;
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

test('prefers a user-authored .emilerules over compatibility fallbacks', () => {
  withWorkspace((workspace) => {
    fs.writeFileSync(path.join(workspace, '.clinerules'), 'fallback');
    fs.writeFileSync(path.join(workspace, '.emilerules'), 'preferred');

    const rules = loadRules();
    assert.equal(rules.active, true);
    assert.equal(rules.name, '.emilerules');
    assert.equal(rules.content, 'preferred');
  });
});

test('returns inactive and an empty prompt block when no rules exist', () => {
  withWorkspace(() => {
    const rules = loadRules();
    assert.deepEqual(rules, { active: false });
    assert.equal(formatRulesBlock(rules), '');
    assert.equal(buildSystemPrompt().includes('=== PROJECT RULES'), false);
  });
});

test('truncates content only after the 12k boundary and labels the block', () => {
  withWorkspace((workspace) => {
    const rulesPath = path.join(workspace, '.emilerules');
    fs.writeFileSync(rulesPath, 'a'.repeat(MAX_RULES_CHARS));
    assert.equal(loadRules().truncated, false);

    fs.writeFileSync(rulesPath, 'a'.repeat(MAX_RULES_CHARS + 1));
    const nextTimestamp = new Date(Date.now() + 2_000);
    fs.utimesSync(rulesPath, nextTimestamp, nextTimestamp);

    const rules = loadRules();
    const block = formatRulesBlock(rules);
    assert.equal(rules.truncated, true);
    assert.equal(rules.content.startsWith('a'.repeat(MAX_RULES_CHARS)), true);
    assert.match(rules.content, /rules truncated for context/);
    assert.match(block, /PROJECT RULES \(\.emilerules \[truncated\]\)/);
  });
});

test('refreshes the mtime cache after the user edits the rules file', () => {
  withWorkspace((workspace) => {
    const rulesPath = path.join(workspace, '.emilerules');
    fs.writeFileSync(rulesPath, 'first');
    assert.equal(loadRules().content, 'first');

    fs.writeFileSync(rulesPath, 'second');
    const nextTimestamp = new Date(Date.now() + 2_000);
    fs.utimesSync(rulesPath, nextTimestamp, nextTimestamp);
    assert.equal(loadRules().content, 'second');
  });
});

test('rejects a supported filename symlinked outside the workspace', () => {
  withWorkspace((workspace) => {
    const externalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emile-rules-external-'));
    try {
      const externalFile = path.join(externalDir, 'secret-rules');
      fs.writeFileSync(externalFile, 'must not leave the workspace');
      fs.symlinkSync(externalFile, path.join(workspace, '.emilerules'));

      assert.equal(findRulesFile(), null);
      assert.deepEqual(loadRules(), { active: false });
    } finally {
      fs.rmSync(externalDir, { recursive: true, force: true });
    }
  });
});

test('strips terminal control sequences while preserving readable layout', () => {
  const unsafe = '\x1B]0;spoofed title\x07hello\x1B[31m red\x1B[0m\nnext\tline\roverwrite';
  const safe = stripTerminalControls(unsafe);

  assert.equal(safe.includes('\x1B'), false);
  assert.equal(safe.includes('\r'), false);
  assert.equal(safe, 'hello red\nnext\tlineoverwrite');
});
