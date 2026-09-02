import test from 'node:test';
import assert from 'node:assert/strict';

import { SKILLS_PICKER_LIMIT, skillPickerOptions } from '../src/ui/skills-picker.js';
import { filterModelOptions } from '../src/ui/model-picker.js';

const skills = Array.from({ length: 14 }, (_, index) => ({
  name: `skill-${index}`,
  description: `Guidance number ${index}`,
  keywords: [],
}));

test('skills picker exposes a searchable window of at most ten skills', () => {
  const options = skillPickerOptions(skills);
  assert.equal(filterModelOptions(options, '', SKILLS_PICKER_LIMIT).length, 10);
  assert.deepEqual(filterModelOptions(options, 'number 12', SKILLS_PICKER_LIMIT), [options[12]]);
});

test('skills picker uses read-only skill metadata for labels', () => {
  assert.deepEqual(skillPickerOptions([{ name: 'secure', description: 'Avoid unsafe output' }]), [{
    value: 'secure',
    label: 'secure — Avoid unsafe output',
  }]);
});
