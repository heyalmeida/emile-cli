import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MODEL_PICKER_LIMIT,
  filterModelOptions,
  sanitizeModelPickerText,
} from '../src/ui/model-picker.js';

const models = Array.from({ length: 12 }, (_, index) => ({
  value: `provider/model-${index}`,
  label: `Model ${index}`,
}));

test('caps an empty model search at seven options', () => {
  assert.equal(filterModelOptions(models).length, MODEL_PICKER_LIMIT);
});

test('matches model ids and labels case-insensitively', () => {
  const options = [
    { value: 'provider/alpha-code', label: 'Fast coding model' },
    { value: 'provider/beta', label: 'Reasoning Model' },
    { value: 'provider/gamma', label: 'General purpose' },
  ];

  assert.deepEqual(
    filterModelOptions(options, 'COD'),
    [options[0]],
  );
  assert.deepEqual(
    filterModelOptions(options, 'reasoning'),
    [options[1]],
  );
});

test('keeps manual model entry available while searching', () => {
  const custom = { value: 'custom', label: 'Other model...' };
  const result = filterModelOptions([...models, custom], 'does-not-exist');
  assert.deepEqual(result, [custom]);
  assert.ok(result.length <= MODEL_PICKER_LIMIT);
});

test('sanitizes control characters from picker text', () => {
  const safe = sanitizeModelPickerText('provider/model\u001b[31m\nname\t');
  assert.equal(safe, 'provider/model [31m name');
  assert.doesNotMatch(safe, /[\u0000-\u001f\u007f\u0080-\u009f]/);
});
