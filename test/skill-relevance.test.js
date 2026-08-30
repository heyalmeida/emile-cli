import test from 'node:test';
import assert from 'node:assert/strict';

import { filterSkillsByRelevance } from '../src/skills.js';

test('explicit skills bypass relevance filtering', () => {
  assert.deepEqual(
    filterSkillsByRelevance(['react-patterns'], 'unrelated shell task'),
    ['react-patterns'],
  );
});

test('auto mode always retains clean-code and filters by task metadata', () => {
  const catalog = [
    { name: 'react-patterns', description: 'React components and hooks' },
    { name: 'python-patterns', description: 'Python code style' },
  ];
  const selected = filterSkillsByRelevance(['all'], 'write a React component', {
    detectedSkills: ['react-patterns', 'python-patterns', 'clean-code'],
    skillCatalog: catalog,
  });

  assert.ok(selected.includes('clean-code'));
  assert.ok(selected.includes('react-patterns'));
  assert.equal(selected.includes('python-patterns'), false);
});

test('empty prompt keeps the complete auto-detected set for resumed sessions', () => {
  const selected = filterSkillsByRelevance(['all'], '');
  assert.ok(selected.includes('clean-code'));
});
