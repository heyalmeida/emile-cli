// model-picker.js — bounded, incremental model selection for /model.
//
// Model discovery belongs to commands.js/models.js. This module owns only
// the terminal interaction and the deterministic filtering used by it.
import readline from 'node:readline';
import { C } from './theme.js';

export const MODEL_PICKER_LIMIT = 7;

/** Removes terminal controls and bounds text before it reaches the terminal. */
export function sanitizeModelPickerText(value, maxLength = 120) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f\u0080-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/**
 * Filters model options by id or label, case-insensitively, and caps the
 * result set rendered by the picker. The custom option remains available so
 * a user can still enter an identifier that is not in a provider catalog.
 */
export function filterModelOptions(options, query = '', limit = MODEL_PICKER_LIMIT) {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : MODEL_PICKER_LIMIT;
  const safeOptions = Array.isArray(options) ? options.filter(option => option && typeof option === 'object') : [];
  const needle = sanitizeModelPickerText(query).toLocaleLowerCase();
  const custom = safeOptions.find(option => option.value === 'custom');
  const modelOptions = safeOptions.filter(option => option.value !== 'custom');
  const matches = modelOptions.filter(option => {
    const haystack = `${sanitizeModelPickerText(option.value)} ${sanitizeModelPickerText(option.label)}`.toLocaleLowerCase();
    return needle === '' || haystack.includes(needle);
  });

  // Reserve one row for manual entry. It is an action, not a catalog model,
  // but keeping it visible preserves the previous wizard's escape hatch.
  const modelLimit = custom ? Math.max(0, safeLimit - 1) : safeLimit;
  const visible = matches.slice(0, modelLimit);
  if (custom) visible.push(custom);
  return visible;
}

function truncateForTerminal(value, columns) {
  const maxLength = Math.max(20, columns - 6);
  const text = sanitizeModelPickerText(value, maxLength);
  return text.length < maxLength ? text : `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

/**
 * Opens the /model picker. In a TTY, every typed character redraws the
 * bounded result list. Non-TTY callers receive a safe cancellation instead
 * of a prompt that could block forever waiting for raw-mode input.
 */
export function promptModelPicker(options, { message = 'Select a model', limit = MODEL_PICKER_LIMIT } = {}) {
  return new Promise((resolve) => {
    if (typeof process.stdin.setRawMode !== 'function' || process.stdin.isTTY === false) {
      resolve(null);
      return;
    }

    const wasRaw = process.stdin.isRaw;
    process.stdin.setRawMode(true);
    process.stdin.resume();
    readline.emitKeypressEvents(process.stdin);

    let query = '';
    let selectedIndex = 0;
    let lastRenderedHeight = 0;
    let settled = false;

    function getMatches() {
      return filterModelOptions(options, query, limit);
    }

    function render() {
      const columns = process.stdout.columns || 80;
      const matches = getMatches();
      selectedIndex = Math.min(selectedIndex, Math.max(0, matches.length - 1));
      const totalMatches = Array.isArray(options) ? options.filter(option => {
        if (!option || option.value === 'custom') return false;
        const haystack = `${sanitizeModelPickerText(option.value)} ${sanitizeModelPickerText(option.label)}`.toLocaleLowerCase();
        return query === '' || haystack.includes(sanitizeModelPickerText(query).toLocaleLowerCase());
      }).length : 0;

      const lines = [
        `${C.accent('?')} ${C.bold(sanitizeModelPickerText(message, Math.max(20, columns - 15)))}`,
        `  ${C.muted('Search:')} ${C.fg(truncateForTerminal(query || 'type a model name', columns))}`,
      ];

      if (matches.length === 0) {
        lines.push(`  ${C.warn('No matching models.')}`);
      } else {
        for (const [index, option] of matches.entries()) {
          const label = truncateForTerminal(option.label || option.value, columns);
          const selected = index === selectedIndex;
          const marker = selected ? C.accent('❯') : C.muted('·');
          lines.push(`  ${marker} ${selected ? C.bold(C.accent(label)) : C.fg(label)}`);
        }
      }

      if (totalMatches > Math.max(0, matches.length - (matches.some(option => option.value === 'custom') ? 1 : 0))) {
        lines.push(`  ${C.muted(`Showing up to ${limit} matches — type more to refine`)}`);
      }
      lines.push(`  ${C.dim('↑↓ select  Enter choose  Esc cancel')}`);

      if (lastRenderedHeight > 0) {
        process.stdout.write(`\x1B[${lastRenderedHeight}A`);
      }
      for (const line of lines) {
        process.stdout.write(`\r\x1B[K${line}\n`);
      }
      lastRenderedHeight = lines.length;
    }

    function cleanup() {
      if (lastRenderedHeight > 0) {
        for (let index = 0; index < lastRenderedHeight; index++) {
          process.stdout.write('\x1B[1A\x1B[2K');
        }
      }
      process.stdin.removeListener('keypress', onKeypress);
      process.stdin.setRawMode(wasRaw);
      process.stdin.pause();
      lastRenderedHeight = 0;
    }

    function finish(value) {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    }

    function onKeypress(str, key = {}) {
      if (key.ctrl && key.name === 'c') {
        finish(null);
        return;
      }
      if (key.name === 'escape') {
        finish(null);
        return;
      }

      const matches = getMatches();
      if (key.name === 'return' || key.name === 'enter') {
        finish(matches[selectedIndex]?.value ?? null);
        return;
      }
      if (key.name === 'up' && matches.length > 0) {
        selectedIndex = (selectedIndex - 1 + matches.length) % matches.length;
      } else if (key.name === 'down' && matches.length > 0) {
        selectedIndex = (selectedIndex + 1) % matches.length;
      } else if (key.name === 'backspace') {
        query = query.slice(0, -1);
        selectedIndex = 0;
      } else if (str && !key.ctrl && !key.meta) {
        query += sanitizeModelPickerText(str, str.length);
        selectedIndex = 0;
      } else {
        return;
      }
      render();
    }

    process.stdin.on('keypress', onKeypress);
    render();
  });
}
