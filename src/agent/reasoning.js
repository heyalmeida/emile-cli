// reasoning.js — provider reasoning normalization for the agent domain.

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function displayField(detail) {
  if (typeof detail.text === 'string') return 'text';
  if (typeof detail.summary === 'string') return 'summary';
  return null;
}

function detailKey(detail) {
  const type = typeof detail.type === 'string' ? detail.type : '';
  if (detail.id !== undefined && detail.id !== null) return `id:${detail.id}:${type}`;
  if (Number.isInteger(detail.index)) return `index:${detail.index}:${type}`;
  return null;
}

/**
 * Appends OpenRouter-style reasoning detail chunks to a preserved block list
 * and returns only the readable text that should be rendered in the UI.
 *
 * Text/summary fragments with the same id/index are merged for the next
 * tool-call request. Encrypted or unknown detail types are preserved but have
 * no display text by design.
 */
export function appendReasoningDetails(target, details) {
  if (!Array.isArray(target) || !Array.isArray(details)) return '';

  let display = '';
  let previousKey = target.length > 0 ? detailKey(target[target.length - 1]) : null;

  for (const detail of details) {
    if (!isRecord(detail)) continue;

    const copy = { ...detail };
    const field = displayField(copy);
    const key = detailKey(copy);
    const existingIndex = key === null
      ? -1
      : target.findIndex((item) => isRecord(item) && detailKey(item) === key);

    if (existingIndex >= 0 && field && typeof target[existingIndex][field] === 'string') {
      target[existingIndex][field] += copy[field];
    } else if (existingIndex >= 0) {
      target[existingIndex] = { ...target[existingIndex], ...copy };
    } else {
      target.push(copy);
    }

    if (field) {
      const value = copy[field];
      if (display.length > 0 && key !== previousKey) display += '\n';
      display += value;
      previousKey = key;
    }
  }

  return display;
}
