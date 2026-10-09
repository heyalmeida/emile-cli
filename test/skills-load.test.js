// skills-load.test.js — skills discovery contract (spec 2026-10-08-skills-path-fix,
// deep-dive P0-2): loadAllSkills() scans `<workspace>/.agent/skills/`, explicit
// lists bypass relevance filtering, auto mode retains clean-code, malformed
// skills are skipped and compilation stays capped (8k/skill, 24k total).
import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  compileSkills,
  detectWorkspaceSkills,
  filterSkillsByRelevance,
  loadAllSkills,
} from '../src/skills.js';
import { config } from '../src/config.js';

function writeSkill(workspace, name, content, frontmatter = null) {
  const dir = path.join(workspace, '.agent', 'skills', name);
  fs.mkdirSync(dir, { recursive: true });
  const body = frontmatter
    ? `---\n${frontmatter}\n---\n${content}`
    : content;
  fs.writeFileSync(path.join(dir, 'SKILL.md'), body, 'utf8');
}

describe('skills discovery (.agent/skills)', () => {
  let tmpWorkspace;
  let warnSpy;
  let warnCalls;

  beforeEach(() => {
    tmpWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'emile-skills-load-'));
    config.workspaceDir = tmpWorkspace;
    warnCalls = [];
    warnSpy = mock.method(console, 'warn', (...args) => { warnCalls.push(args.join(' ')); });
  });

  afterEach(() => {
    warnSpy.mock.restore();
    fs.rmSync(tmpWorkspace, { recursive: true, force: true });
  });

  test('loadAllSkills discovers the vendored clean-code skill with its metadata', () => {
    writeSkill(tmpWorkspace, 'clean-code', 'Keep functions short.', [
      'name: clean-code',
      'description: Baseline clean-code guidance.',
      'keywords:',
      '  - readability',
    ].join('\n'));

    const skills = loadAllSkills();
    assert.equal(skills.length, 1);
    assert.equal(skills[0].name, 'clean-code');
    assert.equal(skills[0].description, 'Baseline clean-code guidance.');
    assert.equal(skills[0].frontmatter.name, 'clean-code');
    assert.deepEqual(skills[0].frontmatter.keywords, ['readability']);
    assert.equal(skills[0].content, 'Keep functions short.');
  });

  test('explicit -s list resolves the skill and bypasses relevance filtering', () => {
    writeSkill(tmpWorkspace, 'clean-code', 'Keep functions short.');
    // Prompt shares no token with the skill, yet the explicit list is
    // authoritative — no relevance filtering applied.
    const selected = filterSkillsByRelevance(['clean-code'], 'an entirely unrelated prompt about gardening');
    assert.deepEqual(selected, ['clean-code']);

    const out = compileSkills(['clean-code']);
    assert.match(out, /\[SKILL: clean-code\]/);
    assert.match(out, /Keep functions short\./);
  });

  test('auto-detection retains clean-code for a task-matching prompt', () => {
    writeSkill(tmpWorkspace, 'clean-code', 'Keep functions short.');
    assert.ok(detectWorkspaceSkills().includes('clean-code'));
    const selected = filterSkillsByRelevance([], 'please keep the code tidy and readable');
    assert.ok(selected.includes('clean-code'), 'auto mode always retains clean-code');

    const out = compileSkills([]);
    assert.match(out, /\[SKILL: clean-code\]/);
  });

  test('a malformed SKILL.md is skipped with a warn() and never throws', () => {
    writeSkill(tmpWorkspace, 'broken', 'unparseable');
    fs.writeFileSync(
      path.join(tmpWorkspace, '.agent', 'skills', 'broken', 'SKILL.md'),
      '---\n: : : not yaml [open\n---\nbody\n',
      'utf8',
    );
    writeSkill(tmpWorkspace, 'clean-code', 'Keep functions short.');

    const skills = loadAllSkills();
    assert.deepEqual(skills.map(s => s.name), ['clean-code']);
    assert.ok(warnCalls.some(msg => /Failed to parse skill file/.test(msg)),
      'expected a warn() about the malformed skill file');
  });

  test('caps: oversize skill body is truncated and the total stays bounded', () => {
    writeSkill(tmpWorkspace, 'big', 'x'.repeat(10_000));
    writeSkill(tmpWorkspace, 'small', 'tiny');

    const single = compileSkills(['big']);
    assert.ok(single.length < 10_000, 'per-skill output must be bounded by the 8k cap');
    assert.match(single, /skill truncated for context/);

    // 8 skills x ~6k chars = ~48k > 24k total cap: not every skill fits.
    for (let i = 0; i < 8; i++) writeSkill(tmpWorkspace, `skill-${i}`, 'y'.repeat(6_000));
    const out = compileSkills(['skill-0', 'skill-1', 'skill-2', 'skill-3', 'skill-4', 'skill-5', 'skill-6', 'skill-7']);
    assert.match(out, /total skills context cap/);
    const injected = (out.match(/\[SKILL: /g) || []).length;
    assert.ok(injected < 8, `expected fewer than 8 skills injected, got ${injected}`);
    assert.ok(out.length < 30_000, 'total output must respect the 24k cap');
  });
});
