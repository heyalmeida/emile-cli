// skills-cap.test.js — skill size caps in the system prompt (IMPROVEMENTS §7.6).
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { compileSkills } from '../src/skills.js';
import { config } from '../src/config.js';

function writeSkill(workspace, name, content) {
  const dir = path.join(workspace, '.agent', 'skills', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), content, 'utf8');
}

describe('compileSkills — size caps (§7.6)', () => {
  let tmpWorkspace;

  beforeEach(() => {
    tmpWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'emile-skills-'));
    config.workspaceDir = tmpWorkspace;
  });

  afterEach(() => {
    fs.rmSync(tmpWorkspace, { recursive: true, force: true });
  });

  test('a single skill larger than the per-skill cap is truncated with a notice', () => {
    writeSkill(tmpWorkspace, 'big-skill', 'x'.repeat(10_000));
    const out = compileSkills(['big-skill']);
    assert.ok(out.length < 10_000, 'compiled output should be bounded');
    assert.match(out, /skill truncated for context/);
    assert.match(out, /\[SKILL: big-skill\] \[truncated\]/);
  });

  test('skills beyond the total cap are omitted with a notice', () => {
    // 8 skills x ~6k chars = ~48k > 24k total cap
    for (let i = 0; i < 8; i++) {
      writeSkill(tmpWorkspace, `skill-${i}`, `y`.repeat(6_000));
    }
    const out = compileSkills(['skill-0', 'skill-1', 'skill-2', 'skill-3', 'skill-4', 'skill-5', 'skill-6', 'skill-7']);
    assert.match(out, /total skills context cap/);
    // Not every skill fit — at least one is missing from the output.
    const injected = (out.match(/\[SKILL: /g) || []).length;
    assert.ok(injected < 8, `expected fewer than 8 skills injected, got ${injected}`);
    // Output stays bounded regardless of input size.
    assert.ok(out.length < 30_000, 'compiled output should respect the total cap');
  });

  test('normal-size skills are injected verbatim (no regression)', () => {
    writeSkill(tmpWorkspace, 'small', 'Keep functions short.');
    const out = compileSkills(['small']);
    assert.match(out, /\[SKILL: small\]/);
    assert.match(out, /Keep functions short\./);
    assert.doesNotMatch(out, /truncated/);
  });
});
