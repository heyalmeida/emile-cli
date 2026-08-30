// edit-file.test.js — editFile matching levels and ambiguity detection
// (IMPROVEMENTS.md §8.3, covering the §1.4 fix).
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { editFile } from '../src/tools/handlers/edit-file.js';
import { config } from '../src/config.js';
import { undoStack, clearFileCache } from '../src/tools/file-state.js';

describe('editFile', () => {
  let tmpWorkspace;
  let filePath;

  beforeEach(() => {
    tmpWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'emile-edit-'));
    config.workspaceDir = tmpWorkspace;
    clearFileCache();
    undoStack.splice(0, undoStack.length);
    filePath = 'sample.js';
    fs.writeFileSync(
      path.join(tmpWorkspace, filePath),
      'const a = 1;\nconst b = 2;\nconst a = 1;\nfunction sum() { return a + b; }\n',
      'utf8'
    );
  });

  afterEach(() => {
    fs.rmSync(tmpWorkspace, { recursive: true, force: true });
  });

  test('level 1: exact match replaces the single occurrence', async () => {
    const result = await editFile({ path: filePath, targetContent: 'const b = 2;', replacementContent: 'const b = 42;' });
    assert.match(result, /Successfully updated/);
    const content = fs.readFileSync(path.join(tmpWorkspace, filePath), 'utf8');
    assert.equal(content, 'const a = 1;\nconst b = 42;\nconst a = 1;\nfunction sum() { return a + b; }\n');
  });

  test('level 1: ambiguous match returns an error and does NOT edit (§1.4)', async () => {
    const result = await editFile({ path: filePath, targetContent: 'const a = 1;', replacementContent: 'const a = 9;' });
    assert.match(result, /Ambiguous match/);
    assert.match(result, /2 times/);
    // File untouched
    const content = fs.readFileSync(path.join(tmpWorkspace, filePath), 'utf8');
    assert.equal(content, 'const a = 1;\nconst b = 2;\nconst a = 1;\nfunction sum() { return a + b; }\n');
    // No undo entry was pushed for a rejected edit
    assert.equal(undoStack.length, 0);
  });

  test('level 2: CRLF-normalized target matches and is not ambiguous when unique', async () => {
    const result = await editFile({
      path: filePath,
      targetContent: 'const b = 2;\r\n',
      replacementContent: 'const b = 3;\n',
    });
    assert.match(result, /Successfully updated/);
    const content = fs.readFileSync(path.join(tmpWorkspace, filePath), 'utf8');
    assert.equal(content, 'const a = 1;\nconst b = 3;\nconst a = 1;\nfunction sum() { return a + b; }\n');
  });

  test('level 2: ambiguous CRLF match returns an error (§1.4)', async () => {
    const result = await editFile({
      path: filePath,
      targetContent: 'const a = 1;\r\n',
      replacementContent: 'x\n',
    });
    assert.match(result, /Ambiguous match/);
    assert.match(result, /2 times/);
  });

  test('level 3: trailing-whitespace-tolerant match applies once', async () => {
    const result = await editFile({
      path: filePath,
      targetContent: 'const b = 2;   ', // trailing spaces the file does not have
      replacementContent: 'const b = 30;',
    });
    assert.match(result, /Successfully updated/);
    const content = fs.readFileSync(path.join(tmpWorkspace, filePath), 'utf8');
    assert.equal(content, 'const a = 1;\nconst b = 30;\nconst a = 1;\nfunction sum() { return a + b; }\n');
  });

  test('level 3: ambiguous whitespace-tolerant match returns an error (§1.4)', async () => {
    const result = await editFile({
      path: filePath,
      targetContent: 'const a = 1;   ', // matches both occurrences after trimEnd
      replacementContent: 'x',
    });
    assert.match(result, /Ambiguous match/);
    assert.match(result, /2 times/);
  });

  test('not-found target returns an error', async () => {
    const result = await editFile({ path: filePath, targetContent: 'no such line here', replacementContent: 'x' });
    assert.match(result, /Could not find targetContent/);
  });

  test('missing file returns an error', async () => {
    const result = await editFile({ path: 'ghost.js', targetContent: 'a', replacementContent: 'b' });
    assert.match(result, /File not found/);
  });

  test('empty targetContent returns an error', async () => {
    const result = await editFile({ path: filePath, targetContent: '', replacementContent: 'x' });
    assert.match(result, /targetContent must not be empty/);
  });

  test('path traversal is rejected', async () => {
    const result = await editFile({ path: '../outside.js', targetContent: 'a', replacementContent: 'b' });
    assert.match(result, /Access denied/);
  });

  test('successful edit pushes the previous content to the undo stack', async () => {
    await editFile({ path: filePath, targetContent: 'const b = 2;', replacementContent: 'const b = 7;' });
    assert.equal(undoStack.length, 1);
    assert.equal(undoStack[0].content, 'const a = 1;\nconst b = 2;\nconst a = 1;\nfunction sum() { return a + b; }\n');
  });
});
