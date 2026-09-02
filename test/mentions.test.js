import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { config } from '../src/config.js';
import { compileMentionAttachments, extractMentionPaths, findMentionCandidates } from '../src/mentions.js';

const originalWorkspace = config.workspaceDir;
function withWorkspace(fn) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'emile-mentions-'));
  config.workspaceDir = workspace;
  try { return fn(workspace); } finally { config.workspaceDir = originalWorkspace; fs.rmSync(workspace, { recursive: true, force: true }); }
}

test('extracts unique @relative paths', () => {
  assert.deepEqual(extractMentionPaths('inspect @src/a.js and @src/a.js then @README.md'), ['src/a.js', 'README.md']);
});

test('attaches a bounded in-workspace text file', () => withWorkspace(workspace => {
  fs.mkdirSync(path.join(workspace, 'src'));
  fs.writeFileSync(path.join(workspace, 'src', 'a.js'), 'export const value = 1;');
  const result = compileMentionAttachments('Please inspect @src/a.js');
  assert.equal(result.warnings.length, 0);
  assert.match(result.context, /attached-file path="src\/a.js"/);
  assert.match(result.context, /export const value/);
}));

test('rejects traversal, absolute, binary and external symlink mentions', () => withWorkspace(workspace => {
  fs.writeFileSync(path.join(workspace, 'binary.bin'), 'a\0b');
  const external = path.join(os.tmpdir(), `emile-mention-secret-${Date.now()}`);
  fs.writeFileSync(external, 'secret');
  fs.symlinkSync(external, path.join(workspace, 'outside.txt'));
  try {
    const result = compileMentionAttachments('@../secret @/etc/passwd @binary.bin @outside.txt');
    assert.equal(result.attachments.length, 0);
    assert.equal(result.warnings.length, 4);
    assert.equal(result.context, '');
  } finally { fs.rmSync(external, { force: true }); }
}));

test('completion candidates are relative regular files and exclude node_modules', () => withWorkspace(workspace => {
  fs.mkdirSync(path.join(workspace, 'src'));
  fs.mkdirSync(path.join(workspace, 'node_modules', 'pkg'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'src', 'main.js'), 'ok');
  fs.writeFileSync(path.join(workspace, 'node_modules', 'pkg', 'hidden.js'), 'no');
  assert.deepEqual(findMentionCandidates('@src/ma'), ['src/main.js']);
}));
