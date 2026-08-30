import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { handleUndo } from '../src/commands/handlers.js';

function tempWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'emile-undo-'));
}

test('multi-level undo restores newest entries first and pops only restored entries', async () => {
  const workspaceDir = tempWorkspace();
  const firstPath = path.join(workspaceDir, 'first.txt');
  const secondPath = path.join(workspaceDir, 'second.txt');
  fs.writeFileSync(firstPath, 'new-first');
  fs.writeFileSync(secondPath, 'new-second');
  const undoStack = [
    { path: firstPath, content: 'old-first' },
    { path: secondPath, content: 'old-second' },
  ];

  await handleUndo({
    undoStack,
    config: { workspaceDir },
    confirmUndo: async () => true,
  }, ['2']);

  assert.equal(fs.readFileSync(firstPath, 'utf8'), 'old-first');
  assert.equal(fs.readFileSync(secondPath, 'utf8'), 'old-second');
  assert.equal(undoStack.length, 0);
});

test('cancelled multi-level undo leaves files and stack unchanged', async () => {
  const workspaceDir = tempWorkspace();
  const filePath = path.join(workspaceDir, 'file.txt');
  fs.writeFileSync(filePath, 'current');
  const undoStack = [
    { path: filePath, content: 'older' },
    { path: filePath, content: 'previous' },
  ];

  await handleUndo({
    undoStack,
    config: { workspaceDir },
    confirmUndo: async () => false,
  }, ['2']);

  assert.equal(fs.readFileSync(filePath, 'utf8'), 'current');
  assert.equal(undoStack.length, 2);
});
