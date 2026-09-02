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
 * Converts either a normal stream fragment or a cumulative provider
 * snapshot into only the text that has not been seen yet.
 */
export function getIncrementalText(previous, incoming) {
  const prior = typeof previous === 'string' ? previous : '';
  const next = typeof incoming === 'string' ? incoming : '';
  if (!next || next === prior) return '';
  if (!prior || next.startsWith(prior)) return next.slice(prior.length);
  if (prior.endsWith(next)) return '';

  // A few gateways resend a small boundary overlap instead of a strict
  // prefix. Remove only overlaps of two or more characters to avoid changing
  // legitimate one-character stream fragments.
  const maxOverlap = Math.min(prior.length, next.length, 256);
  for (let length = maxOverlap; length >= 2; length--) {
    if (prior.slice(-length) === next.slice(0, length)) return next.slice(length);
  }
  return next;
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

    const previousText = existingIndex >= 0 && field && typeof target[existingIndex][field] === 'string'
      ? target[existingIndex][field]
      : '';
    const fragment = field ? getIncrementalText(previousText, copy[field]) : '';

    if (existingIndex >= 0 && field && typeof target[existingIndex][field] === 'string') {
      target[existingIndex] = { ...target[existingIndex], ...copy, [field]: previousText + fragment };
    } else if (existingIndex >= 0) {
      target[existingIndex] = { ...target[existingIndex], ...copy };
    } else {
      target.push(copy);
    }

    if (field && fragment) {
      if (display.length > 0 && key !== previousKey) display += '\n';
      display += fragment;
      previousKey = key;
    }
  }

  return display;
}
